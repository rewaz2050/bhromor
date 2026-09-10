/**
 * Sunamganj Sadar real data — single source of truth for paras, zones, roads.
 * District: Sunamganj, Upazila: Sunamganj Sadar, Hub: Traffic Point.
 * No demo, all real. Now with real lat/lng + distance-based zone.
 */

import type { DeliveryZone } from "./catalog";

export const SUNAMGANJ_DISTRICT = "Sunamganj";
export const SUNAMGANJ_UPAZILA = "Sunamganj Sadar";
export const SUNAMGANJ_HUB = "Traffic Point";

/** Traffic Point, Sunamganj Sadar — central hub */
export const SUNAMGANJ_HUB_COORDS = {
  lat: 25.0703,
  lng: 91.4067,
} as const;

export const SUNAMGANJ_ZONES: DeliveryZone[] = [
  {
    id: "z1",
    name: "Zone A — Traffic Point (0-1.5km)",
    areas: ["Boropara", "Shologhar", "Ukilpara", "Courtpara", "Jail Road", "Modhyabazar", "Kalibari", "Arambagh", "Mollapara"],
    charge: 3000,
    etaLabel: "30–40 min",
    active: true,
  },
  {
    id: "z2",
    name: "Zone B — Sadar Core (1.5-2.5km)",
    areas: ["Notunpara", "Hasannagar", "Tegharia", "Nabinagar", "Sahib Bari Ghat", "Hospital Road", "Kazir Point", "Purba Bazar", "Paschim Bazar"],
    charge: 5000,
    etaLabel: "40–50 min",
    active: true,
  },
  {
    id: "z3",
    name: "Zone C — Sadar Extended (2.5-4km)",
    areas: ["Wayesspur", "Balaka Para", "Jaliapara", "Palpur", "Dargahpara", "Uttarpara", "Dakkhinpara", "Shologhar Bypass"],
    charge: 7000,
    etaLabel: "50–60 min",
    active: true,
  },
  {
    id: "z4",
    name: "Zone D — Sunamganj Sadar Bahire",
    areas: ["Sunamganj Sadar Other", "Dolura", "Gouripur", "Surma River Side", "Mollapara Bahire", "Shantiganj Border"],
    charge: 10000,
    etaLabel: "60–80 min",
    active: true,
  },
];

export const ALL_PARAS = SUNAMGANJ_ZONES.flatMap((z) => z.areas);

export const ROAD_NAMES = [
  "College Road",
  "Hospital Road",
  "Courtpara Road",
  "Jail Road",
  "Modhyabazar Road",
  "Kalibari Road",
  "Arambagh Road",
  "Boropara Road",
  "Shologhar Road",
  "Ukilpara Road",
  "Notunpara Road",
  "Hasannagar Road",
  "Tegharia Road",
  "Nabinagar Road",
  "Sahib Bari Ghat Road",
  "Kazir Point Road",
  "Purba Bazar Road",
  "Paschim Bazar Road",
  "Wayesspur Road",
  "Balaka Road",
  "Jaliapara Road",
  "Palpur Road",
  "Dargahpara Road",
  "Shologhar Bypass",
  "Surma River Road",
  "Traffic Point Road",
];

export const findZoneByPara = (para: string): DeliveryZone | null => {
  const clean = para.trim().toLowerCase();
  if (!clean) return null;
  for (const zone of SUNAMGANJ_ZONES) {
    if (zone.areas.some((a) => a.toLowerCase() === clean)) return zone;
    if (zone.areas.some((a) => clean.includes(a.toLowerCase()) || a.toLowerCase().includes(clean))) {
      return zone;
    }
  }
  return null;
};

export const findZoneByParaExact = (para: string): DeliveryZone | null => {
  const clean = para.trim().toLowerCase();
  for (const zone of SUNAMGANJ_ZONES) {
    if (zone.areas.some((a) => a.toLowerCase() === clean)) return zone;
  }
  return null;
};

export const isOutsideSadar = (para: string): boolean => {
  const zone = findZoneByPara(para);
  return zone ? zone.id === "z4" : false;
};

export const getParaSuggestions = (input: string, limit = 8): string[] => {
  const clean = input.trim().toLowerCase();
  if (!clean) return ALL_PARAS.slice(0, limit);
  const exact = ALL_PARAS.filter((p) => p.toLowerCase().startsWith(clean));
  const partial = ALL_PARAS.filter((p) => p.toLowerCase().includes(clean) && !exact.includes(p));
  return [...exact, ...partial].slice(0, limit);
};

export const getRoadSuggestions = (input: string, limit = 6): string[] => {
  const clean = input.trim().toLowerCase();
  if (!clean) return ROAD_NAMES.slice(0, limit);
  return ROAD_NAMES.filter((r) => r.toLowerCase().includes(clean)).slice(0, limit);
};

export const MIN_ORDER_OUTSIDE_PAISA = 50000; // ৳500 minimum for Zone D

/* ------------------------------------------------------------------ */
/* Geo — Haversine distance from Traffic Point hub                    */
/* ------------------------------------------------------------------ */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distance in km between two lat/lng using Haversine */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.asin(Math.sqrt(h));
};

export const distanceFromHubKm = (point: LatLng): number =>
  haversineKm(SUNAMGANJ_HUB_COORDS, point);

/** Zone by distance from hub — real geo-based fallback */
export const findZoneByDistance = (point: LatLng): DeliveryZone => {
  const d = distanceFromHubKm(point);
  if (d <= 1.5) return SUNAMGANJ_ZONES[0]; // z1
  if (d <= 2.5) return SUNAMGANJ_ZONES[1]; // z2
  if (d <= 4.0) return SUNAMGANJ_ZONES[2]; // z3
  return SUNAMGANJ_ZONES[3]; // z4
};

/** Best zone — para name first, then distance if lat/lng given */
export const findBestZone = (para: string, latLng?: LatLng | null): DeliveryZone | null => {
  const byPara = para ? findZoneByPara(para) : null;
  if (byPara) return byPara;
  if (latLng) return findZoneByDistance(latLng);
  return null;
};

/** Rough bounds for Sunamganj Sadar map */
export const SUNAMGANJ_BOUNDS = {
  north: 25.12,
  south: 25.02,
  east: 91.45,
  west: 91.35,
} as const;
