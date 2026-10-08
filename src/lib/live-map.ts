/**
 * Customer live map — the pure rules behind the tracker's tile map
 * (foodpanda-style "where is my rider, on a real map of my area").
 *
 * Before this the tracker drew a decorative SVG route and printed the
 * rider's coordinates as text: the customer saw numbers, not the street
 * their parcel was on. The admin dispatch map already proved the free stack
 * (Leaflet + OpenStreetMap), so the customer now gets the same tiles — no
 * API key, no per-request bill.
 *
 * Everything here is pure and unit-tested; the Leaflet wiring that consumes
 * it lives in `components/track/rider-tile-map.tsx`.
 */
import { haversineKm } from "./sunamganj";
import { escapeHtml } from "./rider-map-marker";

/** One position. Deliberately structural so `Order` and a live fix both fit. */
export interface MapPoint {
  lat: number;
  lng: number;
}

/* ------------------------------------------------------------------ *
 * Tiles — free, no key. One place to swap if the shop ever outgrows
 * the public OSM tile policy (MapTiler/Stadia free tier use the same
 * Leaflet call with a different URL).
 * ------------------------------------------------------------------ */

export const TRACK_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TRACK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Leaflet's own stylesheet, pinned and SRI-checked like the admin map's. */
export const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
export const LEAFLET_CSS_INTEGRITY = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";

/* ------------------------------------------------------------------ *
 * Framing
 * ------------------------------------------------------------------ */

/**
 * A real point (finite, in range) or null.
 *
 * `0,0` is rejected on purpose: it is what an unset numeric column, an empty
 * form field or a failed geocode turns into, and it sits in the Gulf of
 * Guinea — a pin there would send a family watching a map 4,000 km from
 * Sunamganj. Nothing this shop delivers is at the null island.
 */
export const asMapPoint = (p: Partial<MapPoint> | null | undefined): MapPoint | null => {
  if (!p) return null;
  const lat = typeof p.lat === "number" ? p.lat : NaN;
  const lng = typeof p.lng === "number" ? p.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

/** Midpoint of the known points — where the map opens. Null when there is nothing to look at. */
export const centerOf = (points: readonly (MapPoint | null | undefined)[]): MapPoint | null => {
  const real = points.flatMap((p) => {
    const q = asMapPoint(p);
    return q ? [q] : [];
  });
  if (real.length === 0) return null;
  return {
    lat: real.reduce((sum, p) => sum + p.lat, 0) / real.length,
    lng: real.reduce((sum, p) => sum + p.lng, 0) / real.length,
  };
};

/** Kilometres between two real points, or null when either is missing. */
export const gapKm = (a: MapPoint | null, b: MapPoint | null): number | null => {
  if (!a || !b) return null;
  const km = haversineKm(a, b);
  return Number.isFinite(km) ? km : null;
};

/**
 * Street zoom for the gap the customer is watching. Too close and the rider
 * leaves the frame between two fixes; too far and the pin is a dot on a
 * featureless green field. Sunamganj Sadar spans ~4 km, so 13 is the floor.
 */
export const zoomForGapKm = (km: number | null): number => {
  if (km === null) return 14; // one pin only: a neighbourhood view
  if (km < 0.4) return 17;
  if (km < 1) return 16;
  if (km < 2.5) return 15;
  if (km < 5) return 14;
  return 13;
};

/* ------------------------------------------------------------------ *
 * Movement — the marker slides instead of teleporting
 * ------------------------------------------------------------------ */

/**
 * Beyond this the "move" is a GPS correction (a tunnel, a cold fix, a phone
 * that was asleep), not travel — slide and the pin would fly across town.
 */
export const SLIDE_MAX_KM = 2;
/** Under this the marker is already where it should be. */
export const SLIDE_MIN_M = 15;
/** How long a slide takes. Shorter feels twitchy, longer lies about speed. */
export const SLIDE_MS = 1200;

export type MarkerMotion = "snap" | "slide" | "hold";

/** Snap (first pin / GPS jump), slide (travel) or hold (already there). */
export const markerMotion = (
  from: MapPoint | null,
  to: MapPoint | null,
): MarkerMotion => {
  if (!from || !to) return "snap";
  const km = gapKm(from, to);
  if (km === null) return "snap";
  if (km * 1000 < SLIDE_MIN_M) return "hold";
  return km <= SLIDE_MAX_KM ? "slide" : "snap";
};

/** Ease-out cubic: fast at first, settling into the pin's new spot. */
export const easeOut = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
};

/** Straight-line point between two fixes at `t` (0 = from, 1 = to). */
export const lerpPoint = (from: MapPoint, to: MapPoint, t: number): MapPoint => {
  const k = easeOut(t);
  return { lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k };
};

/* ------------------------------------------------------------------ *
 * Pins
 * ------------------------------------------------------------------ */

const PIN_SHADOW = "0 2px 6px rgba(0,0,0,0.35)";

/**
 * The rider. Live = solid green with a breathing halo; a fix older than the
 * freshness window = hollow with a dashed edge and a "?" so a phone that went
 * quiet cannot pose as a rider who is moving right now.
 */
export const riderPinHtml = (stale: boolean): string =>
  stale
    ? `<div class="ps-rider-pin ps-rider-pin-stale" aria-label="Rider, last known position">&#128693;<span class="ps-rider-pin-flag">?</span></div>`
    : `<div class="ps-rider-pin" aria-label="Rider, live position"><span class="ps-rider-pin-halo"></span>&#128693;</div>`;

/** The door the parcel is going to. */
export const doorPinHtml = (label: string): string =>
  `<div class="ps-door-pin" title="${escapeHtml(label)}"><span class="ps-door-pin-dot"></span></div>`;

/**
 * The map's one stylesheet. Leaflet icons are raw HTML strings, so their look
 * has to live in CSS the page actually loads — injected once, next to
 * Leaflet's own stylesheet.
 */
export const LIVE_MAP_CSS = `
.ps-rider-pin{position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;
  border-radius:9999px;background:#16a34a;border:2px solid #ffffff;box-shadow:${PIN_SHADOW};font-size:17px;line-height:1}
.ps-rider-pin-stale{background:#ffffff;border:2px dashed #16a34a;opacity:.9}
.ps-rider-pin-halo{position:absolute;inset:-8px;border-radius:9999px;background:#22c55e;opacity:.35;
  animation:ps-pin-pulse 2s ease-out infinite}
.ps-rider-pin-flag{position:absolute;top:-6px;right:-6px;width:15px;height:15px;border-radius:9999px;
  background:#dc2626;color:#fff;font-size:10px;font-weight:700;line-height:15px;text-align:center}
@keyframes ps-pin-pulse{0%{transform:scale(.7);opacity:.5}70%{transform:scale(1.25);opacity:0}100%{opacity:0}}
.ps-door-pin{position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;
  border-radius:9999px;background:#142c22;border:2px solid #22c55e;box-shadow:${PIN_SHADOW}}
.ps-door-pin-dot{width:8px;height:8px;border-radius:9999px;background:#22c55e}
`;
