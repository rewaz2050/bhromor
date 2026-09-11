"use client";

import { useEffect, useRef, useState } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import {
  SUNAMGANJ_HUB_COORDS,
  SUNAMGANJ_BOUNDS,
  distanceFromHubKm,
  findZoneByDistance,
  type LatLng,
} from "@/lib/sunamganj";
import { formatBdt } from "@/lib/format";

interface MapPinPickerProps {
  value: LatLng | null;
  onChange: (pos: LatLng) => void;
  onZoneDetected?: (zoneId: string, distanceKm: number) => void;
}

export default function MapPinPicker({ value, onChange, onZoneDetected }: MapPinPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  // Load leaflet CSS
  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);
    return () => {
      // keep css
    };
  }, []);

  // Dynamic import leaflet (client only)
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setLeafletReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || leafletMapRef.current) return;
    let cancelled = false;

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

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(map);

      // Hub marker
      const hubIcon = L.divIcon({
        html: `<div style="background:#142c22;color:#e6c374;border:2px solid #e6c374;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">H</div>`,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([SUNAMGANJ_HUB_COORDS.lat, SUNAMGANJ_HUB_COORDS.lng], { icon: hubIcon })
        .addTo(map)
        .bindPopup("Traffic Point - Hub (Sunamganj Sadar)");

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
      const marker = L.marker([initial.lat, initial.lng], { draggable: true }).addTo(map);
      markerRef.current = marker;

      const updatePos = (latlng: LatLng) => {
        const d = distanceFromHubKm(latlng);
        setDistance(d);
        const zone = findZoneByDistance(latlng);
        onZoneDetected?.(zone.id, d);
        onChange(latlng);
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
        onZoneDetected?.(zone.id, d);
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

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
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Clamp to Sunamganj bounds
        const clamped = {
          lat: Math.min(SUNAMGANJ_BOUNDS.north, Math.max(SUNAMGANJ_BOUNDS.south, ll.lat)),
          lng: Math.min(SUNAMGANJ_BOUNDS.east, Math.max(SUNAMGANJ_BOUNDS.west, ll.lng)),
        };
        onChange(clamped);
        if (markerRef.current) markerRef.current.setLatLng([clamped.lat, clamped.lng]);
        if (leafletMapRef.current) leafletMapRef.current.setView([clamped.lat, clamped.lng], 15);
        const d = distanceFromHubKm(clamped);
        setDistance(d);
        const zone = findZoneByDistance(clamped);
        onZoneDetected?.(zone.id, d);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          Map Pin — Sunamganj Sadar (Traffic Point hub)
        </p>
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-xs font-medium ring-1 ring-line hover:bg-ivory-100"
        >
          📍 Use my location
        </button>
      </div>

      <div
        ref={mapRef}
        className="h-[320px] w-full overflow-hidden rounded-2xl ring-1 ring-line bg-ivory-100"
        style={{ minHeight: 320 }}
      >
        {!loaded && (
          <div className="flex h-full items-center justify-center text-sm text-ink-soft">
            Loading Sunamganj map...
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-forest-50 px-2.5 py-1 ring-1 ring-forest-200">
          Hub: Traffic Point {SUNAMGANJ_HUB_COORDS.lat.toFixed(4)}, {SUNAMGANJ_HUB_COORDS.lng.toFixed(4)}
        </span>
        {distance !== null && value && (
          <>
            <span className="rounded-full bg-gold-50 px-2.5 py-1 ring-1 ring-gold-200 font-semibold">
              Distance: {distance.toFixed(2)} km
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-200">
              Auto Zone: {findZoneByDistance(value).name} · {formatBdt(findZoneByDistance(value).charge)}
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-ink-soft">
        Click map e ba marker drag kore exact bari select korun. Auto zone + delivery charge update hobe. OSM free, no API key.
      </p>
    </div>
  );
}
