"use client";

import { useEffect, useRef, useState } from "react";
import { SUNAMGANJ_HUB_COORDS, SUNAMGANJ_BOUNDS } from "@/lib/sunamganj";
import type { Rider } from "@/lib/catalog";
import type { Order } from "@/lib/orders";

interface AdminLiveMapProps {
  riders: Rider[];
  orders: Order[];
  deliveries: { orderId: string; riderId: string; state: string }[];
}

export default function AdminLiveMap({ riders, orders, deliveries }: AdminLiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    import("leaflet").then((L) => {
      (L as any).Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setLeafletReady(true);
    });
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || leafletMapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = L.map(mapRef.current, {
        center: [SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng],
        zoom: 13,
        minZoom: 11,
        maxZoom: 18,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OSM',
      }).addTo(map);

      // Hub
      const hubIcon = L.divIcon({
        html: `<div style="background:#142c22;color:#e6c374;border:2px solid #e6c374;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:bold">H</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng], { icon: hubIcon })
        .addTo(map)
        .bindPopup("Traffic Point Hub");

      leafletMapRef.current = map;
      setLoaded(true);
      setTimeout(() => map.invalidateSize(), 200);
    });
    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [leafletReady]);

  // Update markers when riders/orders change
  useEffect(() => {
    if (!leafletReady || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      const map = leafletMapRef.current;
      // Clear previous markers (except hub) - we track via custom property
      // Simple: remove all layers that are markers and not hub (hub has custom icon)
      map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker && !( (layer.options.icon?.options as any)?.html?.includes("H</div>"))) {
          map.removeLayer(layer);
        }
      });

      // Riders
      riders.forEach((r) => {
        if (!r.lat || !r.lng) return;
        const color = r.isOnline ? (r.currentLoad && r.currentLoad > 0 ? "#f59e0b" : "#22c55e") : "#6b7280";
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border:2px solid white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${r.name[0]}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const m = L.marker([r.lat, r.lng], { icon }).addTo(map);
        m.bindPopup(`<b>${r.name}</b><br/>${r.phone}<br/>${r.isOnline ? "Online" : "Offline"} · Load ${r.currentLoad ?? 0}<br/>${r.zoneIds.join(",")}`);
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
          html: `<div style="background:${stateColor};color:white;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3)">#${o.id.slice(-4)}</div>`,
          className: "",
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        });
        const m = L.marker([o.lat, o.lng], { icon }).addTo(map);
        m.bindPopup(`<b>#${o.id}</b><br/>${o.customer.name}<br/>${o.customer.area}<br/>${o.zoneName}<br/>${o.status}<br/>${delivery ? `Rider: ${delivery.riderId.slice(0,6)} · ${delivery.state}` : "No rider"}`);

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
    });
  }, [riders, orders, deliveries, leafletReady]);

  const onlineRiders = riders.filter((r) => r.isOnline).length;
  const ridersWithPin = riders.filter((r) => r.lat && r.lng).length;
  const ordersWithPin = orders.filter((o) => o.lat && o.lng).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-200">🟢 Online riders: {onlineRiders}/{riders.length}</span>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 ring-1 ring-sky-200">📍 Riders with pin: {ridersWithPin}</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 ring-1 ring-amber-200">📦 Orders with pin: {ordersWithPin}/{orders.length}</span>
        <span className="rounded-full bg-forest-50 px-2.5 py-1 ring-1 ring-forest-200">H = Traffic Point Hub</span>
      </div>
      <div ref={mapRef} className="h-[420px] w-full rounded-2xl ring-1 ring-line bg-ivory-100">
        {!loaded && <div className="flex h-full items-center justify-center text-sm text-ink-soft">Loading live dispatch map...</div>}
      </div>
      <p className="text-[11px] text-ink-soft">OSM free. Rider green=free, amber=busy, gray=offline. Order colors: blue=offered/accepted, amber=picked, green=delivered. Lines show hub→order or rider→order.</p>
    </div>
  );
}
