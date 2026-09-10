/**
 * Sunamganj Sadar real data — single source of truth for paras, zones, roads.
 * District: Sunamganj, Upazila: Sunamganj Sadar, Hub: Traffic Point.
 * No demo, all real.
 */

import type { DeliveryZone } from "./catalog";

export const SUNAMGANJ_DISTRICT = "Sunamganj";
export const SUNAMGANJ_UPAZILA = "Sunamganj Sadar";
export const SUNAMGANJ_HUB = "Traffic Point";

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
