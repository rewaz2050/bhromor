"use client";

/**
 * The tracker's real map — Leaflet + OpenStreetMap tiles, the same free stack
 * the admin dispatch map and the checkout pin picker already use. No API key,
 * no per-request bill: the customer sees their own neighbourhood, the rider's
 * pin on it, and the line between the two.
 *
 * Honest behaviour, matching the rest of the tracker:
 *   • nothing is invented — a pin is drawn only from a real coordinate;
 *   • a rider fix older than the freshness window is drawn hollow with a "?"
 *     instead of pretending to move (`lib/live-map` → `riderPinHtml`);
 *   • the marker slides between fixes instead of teleporting, but a >2 km
 *     jump snaps, because that is a GPS correction and not travel;
 *   • the map follows the rider until the customer pans it themselves, then
 *     it stays put and offers a "re-centre" button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";
import {
  LEAFLET_CSS_INTEGRITY,
  LEAFLET_CSS_URL,
  LIVE_MAP_CSS,
  SLIDE_MS,
  TRACK_TILE_ATTRIBUTION,
  TRACK_TILE_URL,
  asMapPoint,
  centerOf,
  gapKm,
  lerpPoint,
  markerMotion,
  riderPinHtml,
  doorPinHtml,
  zoomForGapKm,
  type MapPoint,
} from "@/lib/live-map";
import { SUNAMGANJ_HUB_COORDS } from "@/lib/sunamganj";
import { escapeHtml } from "@/lib/rider-map-marker";

/**
 * Leaflet is code-split, and it is loaded ONCE for the whole page: the map,
 * the two pins and the route line all need it, and asking for the same dynamic
 * import four times per render cycle is four chances to get a different
 * module instance back. Cached at module scope so every effect shares it.
 */
type LeafletModule = typeof import("leaflet");
let leafletPromise: Promise<LeafletModule> | null = null;
const loadLeaflet = (): Promise<LeafletModule> =>
  (leafletPromise ??= import("leaflet"));

/** Leaflet's CSS + the pin styles, once per document. */
let stylesInjected = false;
const injectMapStyles = (): void => {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS_URL;
  link.integrity = LEAFLET_CSS_INTEGRITY;
  link.crossOrigin = "";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = LIVE_MAP_CSS;
  document.head.appendChild(style);
};

export interface RiderTileMapProps {
  /** The delivery pin from checkout. Null when the customer never dropped one. */
  destination: MapPoint | null;
  /** The rider's last known fix. Null until the first one arrives. */
  rider: MapPoint | null;
  /** The fix is too old to call live — the pin goes hollow. */
  stale?: boolean;
  destinationLabel?: string;
  riderLabel?: string;
  /** Reported once the tiles are up, so the placeholder can go. */
  onReady?: () => void;
  /**
   * Leaflet could not load or could not build a map (offline, blocked CDN, a
   * browser with no canvas). The caller swaps the schematic route back in
   * rather than leaving the customer a blank rectangle.
   */
  onFailed?: () => void;
}

export function RiderTileMap({
  destination,
  rider,
  stale = false,
  destinationLabel = "আপনার ঠিকানা",
  riderLabel = "রাইডার",
  onReady,
  onFailed,
}: RiderTileMapProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const riderMarkerRef = useRef<LeafletMarker | null>(null);
  const doorMarkerRef = useRef<LeafletMarker | null>(null);
  const lineRef = useRef<LeafletPolyline | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Where the pin is drawn right now — the start of the next slide. */
  const shownRiderRef = useRef<MapPoint | null>(null);
  /** The customer panned/zoomed: stop following until they ask for it. */
  const followingRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);

  /* ---------------- follow / re-centre ---------------- */
  /** Keep both pins framed while we are still following the rider. */
  const followOrIgnore = useCallback(
    (map: LeafletMap, to: MapPoint) => {
      if (!followingRef.current) return;
      const door = asMapPoint(destination);
      if (!door) {
        map.setView([to.lat, to.lng], Math.max(map.getZoom(), 16), { animate: true });
        return;
      }
      map.fitBounds(
        [
          [to.lat, to.lng],
          [door.lat, door.lng],
        ],
        { padding: [48, 48], maxZoom: 17, animate: true },
      );
    },
    [destination],
  );

  /* ---------------- map + tiles (once) ---------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    injectMapStyles();
    let cancelled = false;
    void loadLeaflet()
      .then((L) => {
        if (cancelled || !holderRef.current || mapRef.current) return;
        const start = centerOf([destination, rider]) ?? SUNAMGANJ_HUB_COORDS;
        const map = L.map(holderRef.current, {
          center: [start.lat, start.lng],
          zoom: zoomForGapKm(gapKm(destination, rider)),
          minZoom: 11,
          maxZoom: 18,
          // A tracking page scrolls: the wheel must not hijack it on a phone.
          scrollWheelZoom: false,
          attributionControl: true,
        });
        L.tileLayer(TRACK_TILE_URL, { attribution: TRACK_TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        // Hands-off detection: from the first drag the map belongs to the customer.
        const stopFollowing = () => {
          if (followingRef.current) {
            followingRef.current = false;
            setFollowing(false);
          }
        };
        map.on("dragstart", stopFollowing);
        map.on("zoomstart", stopFollowing);
        mapRef.current = map;
        setReady(true);
        onReady?.();
        // The container is laid out after this effect; Leaflet needs a nudge.
        window.setTimeout(() => map.invalidateSize(), 200);
      })
      .catch(() => {
        if (!cancelled) onFailed?.();
      });
    return () => {
      cancelled = true;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
      doorMarkerRef.current = null;
      lineRef.current = null;
      shownRiderRef.current = null;
    };
    // Mount only: `destination`/`rider` are read here just to pick the first frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- the door pin ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    const door = asMapPoint(destination);
    if (!map || !ready) return;
    void loadLeaflet().then((L) => {
      if (!door) {
        if (doorMarkerRef.current) {
          map.removeLayer(doorMarkerRef.current);
          doorMarkerRef.current = null;
        }
        return;
      }
      if (!doorMarkerRef.current) {
        const icon = L.divIcon({
          html: doorPinHtml(destinationLabel),
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const pin = L.marker([door.lat, door.lng], { icon });
        pin.addTo(map);
        pin.bindPopup(doorPinTitle(destinationLabel));
        doorMarkerRef.current = pin;
      } else {
        doorMarkerRef.current.setLatLng([door.lat, door.lng]);
      }
    });
  }, [destination, destinationLabel, ready]);

  /* ---------------- the rider pin, with the slide ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const to = asMapPoint(rider);
    const from = shownRiderRef.current;

    if (!to) {
      if (riderMarkerRef.current) {
        map.removeLayer(riderMarkerRef.current);
        riderMarkerRef.current = null;
        shownRiderRef.current = null;
      }
      return;
    }

    void loadLeaflet().then((L) => {
      const icon = L.divIcon({
        html: riderPinHtml(stale),
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const motion = markerMotion(from, to);

      if (!riderMarkerRef.current || motion === "snap") {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        if (!riderMarkerRef.current) {
          const pin = L.marker([to.lat, to.lng], { icon });
          pin.addTo(map);
          pin.bindPopup(riderPinTitle(riderLabel, stale));
          riderMarkerRef.current = pin;
        } else {
          riderMarkerRef.current.setLatLng([to.lat, to.lng]);
          riderMarkerRef.current.setIcon(icon);
          riderMarkerRef.current.setPopupContent(riderPinTitle(riderLabel, stale));
        }
        shownRiderRef.current = to;
        followOrIgnore(map, to);
        return;
      }

      if (motion === "hold") {
        riderMarkerRef.current.setIcon(icon);
        riderMarkerRef.current.setPopupContent(riderPinTitle(riderLabel, stale));
        shownRiderRef.current = to;
        followOrIgnore(map, to);
        return;
      }

      // Travel: slide the pin so the eye keeps it, instead of a teleport.
      const door = asMapPoint(destination);
      const startAt = performance.now();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      const step = (now: number) => {
        const marker = riderMarkerRef.current;
        if (!marker) return;
        const t = Math.min(1, (now - startAt) / SLIDE_MS);
        const at = lerpPoint(from!, to, t);
        marker.setLatLng([at.lat, at.lng]);
        // The route line follows the pin frame by frame — otherwise it would
        // be drawn to the new fix while the marker was still a street behind.
        if (door) {
          lineRef.current?.setLatLngs([
            [at.lat, at.lng],
            [door.lat, door.lng],
          ]);
        }
        shownRiderRef.current = at;
        if (t < 1) {
          frameRef.current = window.requestAnimationFrame(step);
        } else {
          frameRef.current = null;
          shownRiderRef.current = to;
          marker.setIcon(icon);
          marker.setPopupContent(riderPinTitle(riderLabel, stale));
        }
      };
      frameRef.current = window.requestAnimationFrame(step);
      followOrIgnore(map, to);
    });
  }, [rider, riderLabel, stale, ready, followOrIgnore, destination]);

  /* ---------------- the line between the two ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const a = shownRiderRef.current ?? asMapPoint(rider);
    const b = asMapPoint(destination);
    void loadLeaflet().then((L) => {
      if (!a || !b) {
        if (lineRef.current) {
          map.removeLayer(lineRef.current);
          lineRef.current = null;
        }
        return;
      }
      if (!lineRef.current) {
        const line = L.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          { color: "#c99738", weight: 3, dashArray: "6 8", opacity: 0.9 },
        );
        line.addTo(map);
        lineRef.current = line;
      } else {
        lineRef.current.setLatLngs([
          [a.lat, a.lng],
          [b.lat, b.lng],
        ]);
      }
    });
  }, [destination, rider, ready]);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    followingRef.current = true;
    setFollowing(true);
    const to = shownRiderRef.current ?? asMapPoint(rider);
    const door = asMapPoint(destination);
    if (to && door) {
      map.fitBounds(
        [
          [to.lat, to.lng],
          [door.lat, door.lng],
        ],
        { padding: [48, 48], maxZoom: 17, animate: true },
      );
    } else if (to) {
      map.setView([to.lat, to.lng], 16, { animate: true });
    } else if (door) {
      map.setView([door.lat, door.lng], 16, { animate: true });
    }
  }, [destination, rider]);

  return (
    <div className="relative h-full w-full" data-testid="rider-tile-map">
      <div ref={holderRef} className="h-full w-full bg-forest-950" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-forest-950 text-xs text-ivory-100/80">
          ম্যাপ লোড হচ্ছে…
        </div>
      )}
      {ready && !following && (
        <button
          type="button"
          onClick={recenter}
          data-testid="map-recenter"
          className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-paper/95 text-forest-900 shadow ring-1 ring-line transition-colors hover:bg-paper"
          aria-label="ম্যাপ আবার রাইডারের উপর আনুন"
          title="রাইডারকে আবার মাঝে আনুন"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="6" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* Popup text — plain HTML, so anything self-entered is escaped. */
const doorPinTitle = (label: string): string =>
  `<b>${escapeHtml(label)}</b><br/>ডেলিভারি ঠিকানা`;
const riderPinTitle = (label: string, stale: boolean): string =>
  `<b>${escapeHtml(label)}</b><br/>${
    stale
      ? "শেষ জানা অবস্থান — সিগন্যাল পাওয়া যাচ্ছে না"
      : "লাইভ অবস্থান"
  }`;
