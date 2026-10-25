"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MAP_ERROR_TILE_URL } from "@/lib/live-map";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import {
  SUNAMGANJ_HUB_COORDS,
  SUNAMGANJ_BOUNDS,
  distanceFromHubKm,
  findZoneByDistance,
  type LatLng,
} from "@/lib/sunamganj";
import { formatBdt } from "@/lib/format";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconMapPin } from "@/components/ui/icons";

interface MapPinPickerProps {
  value: LatLng | null;
  onChange: (pos: LatLng) => void;
  onZoneDetected?: (zoneId: string, distanceKm: number) => void;
}

export default function MapPinPicker({ value, onChange, onZoneDetected }: MapPinPickerProps) {
  const { t, lang } = useLanguage();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const callbacks = useRef({ onChange, onZoneDetected });
  useEffect(() => { callbacks.current = { onChange, onZoneDetected }; }, [onChange, onZoneDetected]);
  const hubMarkerRef = useRef<Marker | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [locationError, setLocationError] = useState<false | "unavailable" | "outside">(false);

  // Init map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    let frame: number | undefined;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = L.map(mapRef.current, {
        center: [value?.lat ?? SUNAMGANJ_HUB_COORDS.lat, value?.lng ?? SUNAMGANJ_HUB_COORDS.lng],
        zoom: 14,
        minZoom: 12,
        maxZoom: 18,
        maxBounds: [
          [SUNAMGANJ_BOUNDS.south, SUNAMGANJ_BOUNDS.west],
          [SUNAMGANJ_BOUNDS.north, SUNAMGANJ_BOUNDS.east],
        ],
      });

      leafletMapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        errorTileUrl: MAP_ERROR_TILE_URL,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).on("tileerror", () => { if (!cancelled) setTileError(true); }).addTo(map);

      // Hub marker
      const hubIcon = L.divIcon({
        html: `<div style="background:#142c22;color:#e6c374;border:2px solid #e6c374;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">H</div>`,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      hubMarkerRef.current = L.marker([SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng], { icon: hubIcon })
        .addTo(map)
        .bindPopup(t("mapPin.hubPopup"));

      // Zone circles
      const zones = [
        { km: 1.5, color: "#22c55e", label: "Zone A" },
        { km: 2.5, color: "#eab308", label: "Zone B" },
        { km: 4.0, color: "#f97316", label: "Zone C" },
      ];
      zones.forEach((z) => {
        L.circle([SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng], {
          radius: z.km * 1000,
          color: z.color,
          fillColor: z.color,
          fillOpacity: 0.06,
          weight: 1,
          dashArray: "6 6",
        }).addTo(map);
      });

      // Draggable customer marker
      const initial = value ?? { lat: SUNAMGANJ_HUB_COORDS.lat + 0.003, lng: SUNAMGANJ_HUB_COORDS.lng + 0.002 };
      const icon = L.divIcon({
        html: '<span style="display:block;width:28px;height:28px;border-radius:50%;background:#142c22;border:3px solid white"></span>',
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const marker = L.marker([initial.lat, initial.lng], { draggable: true, icon }).addTo(map);
      markerRef.current = marker;

      const updatePos = (latlng: LatLng) => {
        const d = distanceFromHubKm(latlng);
        setDistance(d);
        const zone = findZoneByDistance(latlng);
        callbacks.current.onZoneDetected?.(zone.id, d);
        callbacks.current.onChange(latlng);
      };

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        updatePos({ lat: ll.lat, lng: ll.lng });
      });

      map.on("click", (e: LeafletMouseEvent) => {
        const ll = e.latlng;
        marker.setLatLng(ll);
        updatePos({ lat: ll.lat, lng: ll.lng });
      });

      // Initial distance
      const d = distanceFromHubKm(initial);
      setDistance(d);
      if (!value) {
        // Don't auto-trigger on first load if no value - let user pick
      } else {
        const zone = findZoneByDistance(initial);
        callbacks.current.onZoneDetected?.(zone.id, d);
      }

      leafletMapRef.current = map;
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
      markerRef.current = null;
      hubMarkerRef.current = null;
      setLoaded(false);
      setFailed(true);
    });

    return () => {
      cancelled = true;
      resize?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      markerRef.current = null;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        hubMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Keep the hub popup in the active language
  const hubPopup = t("mapPin.hubPopup");
  useEffect(() => {
    hubMarkerRef.current?.setPopupContent(hubPopup);
  }, [hubPopup]);

  // Update marker when value changes externally
  useEffect(() => {
    if (!value || !markerRef.current || !leafletMapRef.current) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - value.lat) > 0.00001 || Math.abs(current.lng - value.lng) > 0.00001) {
      markerRef.current.setLatLng([value.lat, value.lng]);
      leafletMapRef.current.setView([value.lat, value.lng], leafletMapRef.current.getZoom());
      const d = distanceFromHubKm(value);
      setDistance(d);
    }
  }, [value]);

  const handleUseMyLocation = () => {
    setLocationError(false);
    if (!navigator.geolocation) { setLocationError("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return;
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) {
          setLocationError("unavailable");
          return;
        }
        const inside = ll.lat >= SUNAMGANJ_BOUNDS.south && ll.lat <= SUNAMGANJ_BOUNDS.north &&
          ll.lng >= SUNAMGANJ_BOUNDS.west && ll.lng <= SUNAMGANJ_BOUNDS.east;
        if (!inside) {
          // Match checkout's outer GPS control: never invent a boundary pin.
          setLocationError("outside");
          return;
        }
        callbacks.current.onChange(ll);
        if (markerRef.current) markerRef.current.setLatLng([ll.lat, ll.lng]);
        if (leafletMapRef.current) leafletMapRef.current.setView([ll.lat, ll.lng], 15);
        const d = distanceFromHubKm(ll);
        setDistance(d);
        const zone = findZoneByDistance(ll);
        callbacks.current.onZoneDetected?.(zone.id, d);
      },
      () => { if (mounted.current) setLocationError("unavailable"); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          {t("mapPin.title")}
        </p>
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-paper px-3 py-1 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
        >
          <IconMapPin className="h-3.5 w-3.5" />
          {t("mapPin.useMyLocation")}
        </button>
      </div>

      <div
        role="region"
        aria-label={lang === "bn" ? "ডেলিভারি ঠিকানার ম্যাপ" : "Delivery location map"}
        ref={mapRef}
        className="relative isolate h-[320px] w-full overflow-hidden rounded-2xl ring-1 ring-line bg-ivory-100"
        style={{ minHeight: 320 }}
      >
        {!loaded && !failed && (
          <div className="flex h-full items-center justify-center text-sm text-ink-soft">
            {t("mapPin.loading")}
          </div>
        )}
      </div>

      {(failed || tileError) && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper p-3 text-sm text-ink-soft ring-1 ring-line">
          <p>{failed
            ? (lang === "bn" ? "ম্যাপ লোড করা যায়নি। ঠিকানার অন্য ঘরগুলো ব্যবহার করুন অথবা আবার চেষ্টা করুন।" : "Map could not load. Use the other address fields or try again.")
            : (lang === "bn" ? "রাস্তার বিবরণ পাওয়া যাচ্ছে না। পিন বেছে নেওয়া এখনও সম্ভব।" : "Street details are unavailable. You can still select a pin.")}</p>
          <button type="button" className="min-h-11 rounded-lg px-3 font-semibold ring-1 ring-line" onClick={() => { setFailed(false); setTileError(false); setLoaded(false); setAttempt(n => n + 1); }}>
            {lang === "bn" ? "ম্যাপ আবার চেষ্টা করুন" : "Retry map"}
          </button>
        </div>
      )}
      {locationError && <p role="status" className="text-sm text-ink-soft">{locationError === "outside"
        ? (lang === "bn" ? "আপনার লোকেশন সুনামগঞ্জ এলাকার বাইরে। ডেলিভারি ঠিকানা লিখুন অথবা ম্যাপে পিন বেছে নিন।" : "Your location is outside the Sunamganj area. Enter the delivery address or select a pin on the map.")
        : (lang === "bn" ? "লোকেশন পাওয়া যায়নি। ম্যাপে পিন বেছে নিন অথবা ঠিকানা লিখুন।" : "Location unavailable. Select a pin or enter your address.")}</p>}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-forest-50 px-2.5 py-1 ring-1 ring-forest-200">
          {t("mapPin.hub").replace("{lat}", SUNAMGANJ_HUB_COORDS.lat.toFixed(4)).replace("{lng}", SUNAMGANJ_HUB_COORDS.lng.toFixed(4))}
        </span>
        {distance !== null && value && (
          <>
            <span className="rounded-full bg-gold-50 px-2.5 py-1 ring-1 ring-gold-200 font-semibold">
              {t("mapPin.distance").replace("{km}", distance.toFixed(2))}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-200">
              {t("mapPin.autoZone").replace("{zone}", findZoneByDistance(value).name).replace("{charge}", formatBdt(findZoneByDistance(value).charge))}
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-ink-soft">
        {t("mapPin.hint")}
      </p>
    </div>
  );
}
