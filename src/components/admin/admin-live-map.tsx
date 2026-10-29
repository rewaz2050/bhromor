"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import styles from "./admin-live-map.module.css";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { SUNAMGANJ_HUB_COORDS } from "@/lib/sunamganj";
import type { Rider } from "@/lib/catalog";
import type { Order } from "@/lib/orders";
import { escapeHtml, riderMarkerHtml, riderMarkerStyle, riderPopupHtml } from "@/lib/rider-map-marker";
import { useNow } from "@/lib/use-now";

/** Marker identity: hub markers are never cleared on refresh. */
const HUB_MARKER_TAG = "ps-hub-marker";

interface AdminLiveMapProps {
  riders: Rider[];
  orders: Order[];
  deliveries: { orderId: string; riderId: string; state: string }[];
}

export default function AdminLiveMap({ riders, orders, deliveries }: AdminLiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Redraw once a minute so a pin whose phone went quiet turns "stale" without a refresh.
  const now = useNow(60_000);

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    let frame: number | undefined;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = L.map(mapRef.current, {
        center: [SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng],
        zoom: 13,
        minZoom: 11,
        maxZoom: 18,
      });
      leafletMapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        // A failed request must not leave the browser's broken-image icon.
        errorTileUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#f1eee5" d="M0 0h256v256H0z"/><path d="M0 0h256v256H0z" fill="none" stroke="#ddd7c8"/></svg>'),
      }).on("tileerror", () => {
        if (!cancelled) setTileError(true);
      }).addTo(map);

      // Hub
      const hubIcon = L.divIcon({
        html: `<div style="background:#142c22;color:#e6c374;border:2px solid #e6c374;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:bold">H</div>`,
        className: HUB_MARKER_TAG,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng], { icon: hubIcon })
        .addTo(map)
        .bindPopup("Traffic Point Hub");

      setLoaded(true);
      frame = requestAnimationFrame(() => { if (!cancelled) map.invalidateSize(); });
      if (typeof ResizeObserver !== "undefined") {
        resize = new ResizeObserver(() => { if (!cancelled) map.invalidateSize(); });
        resize.observe(mapRef.current);
      }
    }).catch(() => {
      if (cancelled) return;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      setLoaded(false);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [attempt]);

  // Update markers when riders/orders change
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!loaded || !map) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || leafletMapRef.current !== map) return;
      // Clear previous rider/order markers and lines; the hub marker (tagged
      // by its icon className) and the tile layer stay.
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          const cls = (layer as LeafletMarker).options.icon?.options.className ?? "";
          if (!cls.includes(HUB_MARKER_TAG)) map.removeLayer(layer);
        } else if (layer instanceof L.Polyline) {
          map.removeLayer(layer);
        }
      });

      // Riders
      riders.forEach((r) => {
        if (!r.lat || !r.lng) return;
        const style = riderMarkerStyle(r, now);
        const icon = L.divIcon({
          html: riderMarkerHtml(r.name, style),
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const m = L.marker([r.lat, r.lng], { icon }).addTo(map);
        m.bindPopup(riderPopupHtml(r, style));
      });

      // Orders with pin
      orders.forEach((o) => {
        if (!o.lat || !o.lng) return;
        const delivery = deliveries.find((d) => d.orderId === o.id);
        const stateColor = delivery
          ? delivery.state === "delivered"
            ? "#22c55e"
            : delivery.state === "picked_up"
            ? "#f59e0b"
            : "#3b82f6"
          : "#ef4444";
        const icon = L.divIcon({
          html: `<div style="background:${stateColor};color:white;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3)">#${escapeHtml(o.id.slice(-4))}</div>`,
          className: "",
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        });
        const m = L.marker([o.lat, o.lng], { icon }).addTo(map);
        m.bindPopup(`<b>#${escapeHtml(o.id)}</b><br/>${escapeHtml(o.customer.name)}<br/>${escapeHtml(o.customer.area)}<br/>${escapeHtml(o.zoneName)}<br/>${escapeHtml(o.status)}<br/>${delivery ? `Rider: ${escapeHtml(delivery.riderId.slice(0, 6))} · ${escapeHtml(delivery.state)}` : "No rider"}`);

        // Line from hub to order if no rider, or rider to order if assigned
        const riderForOrder = delivery ? riders.find((r) => r.id === delivery.riderId && r.lat && r.lng) : null;
        if (riderForOrder) {
          L.polyline(
            [
              [riderForOrder.lat!, riderForOrder.lng!],
              [o.lat, o.lng],
            ],
            { color: stateColor, weight: 2, dashArray: "5 5", opacity: 0.7 },
          ).addTo(map);
        } else {
          L.polyline(
            [
              [SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng],
              [o.lat, o.lng],
            ],
            { color: "#94a3b8", weight: 1, dashArray: "4 8", opacity: 0.5 },
          ).addTo(map);
        }
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [riders, orders, deliveries, loaded, attempt, now]);

  const onlineRiders = riders.filter((r) => r.isOnline).length;
  const ridersWithPin = riders.filter((r) => r.lat && r.lng).length;
  const staleRiders = riders.filter((r) => r.lat && r.lng && riderMarkerStyle(r, now).stale).length;
  const ordersWithPin = orders.filter((o) => o.lat && o.lng).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-200">🟢 Online riders: {onlineRiders}/{riders.length}</span>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 ring-1 ring-sky-200">📍 Riders with pin: {ridersWithPin}</span>
        {staleRiders > 0 && (
          <span data-testid="stale-riders" className="rounded-full bg-rose-50 px-2.5 py-1 ring-1 ring-rose-200">
            ⚠ Old location: {staleRiders} (dashed pins)
          </span>
        )}
        <span className="rounded-full bg-amber-50 px-2.5 py-1 ring-1 ring-amber-200">📦 Orders with pin: {ordersWithPin}/{orders.length}</span>
        <span className="rounded-full bg-forest-50 px-2.5 py-1 ring-1 ring-forest-200">H = Traffic Point Hub</span>
      </div>
      {(failed || tileError) && (
        <div className="rounded-xl border border-line bg-ivory-100 p-3 text-sm text-ink">
          <p role="status">{failed ? "The dispatch map could not load. Your dispatch lists are still available below." : "The map background could not load completely. Pins may be visible without street details."}</p>
          <button type="button" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-4 font-semibold text-forest-900" onClick={() => {
            setLoaded(false); setFailed(false); setTileError(false); setAttempt(value => value + 1);
          }}>Retry map</button>
        </div>
      )}
      <div className={`${styles.frame} relative isolate overflow-hidden rounded-2xl bg-ivory-100 ring-1 ring-line`}>
        <div ref={mapRef} role="region" aria-label="Live dispatch map" className="h-[420px] w-full" />
        {!loaded && !failed && <div role="status" className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-ivory-100 text-sm text-ink-soft">Loading live dispatch map...</div>}
      </div>
      <p className="text-[11px] text-ink-soft">OSM free. Rider green=free, amber=busy, gray=offline. Order colors: blue=offered/accepted, amber=picked, green=delivered. Lines show hub→order or rider→order.</p>
    </div>
  );
}
