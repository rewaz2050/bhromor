/**
 * Sunamganj Sadar real data — single source of truth for paras, zones, roads.
 * District: Sunamganj, Upazila: Sunamganj Sadar, Hub: Traffic Point.
 * Real lat/lng + distance-based zones.
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
    name: "Zone A — Sunamganj City (A Zone)",
    areas: ["Boropara", "Shologhar", "Ukilpara", "Courtpara", "Jail Road", "Modhyabazar", "Kalibari", "Arambagh", "Mollapara"],
    charge: 6000,
    etaLabel: "30–40 min",
    active: true,
  },
  {
    id: "z2",
    name: "Zone B — Sadar Core (1.5-2.5km)",
    areas: ["Notunpara", "Hasannagar", "Tegharia", "Nabinagar", "Sahib Bari Ghat", "Hospital Road", "Kazir Point", "Purba Bazar", "Paschim Bazar"],
    charge: 6000,
    etaLabel: "40–50 min",
    active: true,
  },
  {
    id: "z3",
    name: "Zone C — Sadar Extended (2.5-4km)",
    areas: ["Wayesspur", "Balaka Para", "Jaliapara", "Palpur", "Dargahpara", "Uttarpara", "Dakkhinpara", "Shologhar Bypass"],
    charge: 6000,
    etaLabel: "50–60 min",
    active: true,
  },
  {
    id: "z4",
    name: "Zone D — Sadar Bahire / Other district (Courier)",
    areas: ["Sunamganj Sadar Other", "Dolura", "Gouripur", "Surma River Side", "Mollapara Bahire", "Shantiganj Border"],
    charge: 6000,
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
/* Simple checkout form data — District / Upazila / Para               */
/* ------------------------------------------------------------------ */

export interface GeoOption {
  en: string;
  bn: string;
}

/** All 64 districts — Sunamganj first (the serviced home district). */
export const DISTRICTS: GeoOption[] = [
  { en: "Sunamganj", bn: "সুনামগঞ্জ" },
  { en: "Sylhet", bn: "সিলেট" },
  { en: "Moulvibazar", bn: "মৌলভীবাজার" },
  { en: "Habiganj", bn: "হবিগঞ্জ" },
  { en: "Netrokona", bn: "নেত্রকোণা" },
  { en: "Kishoreganj", bn: "কিশোরগঞ্জ" },
  { en: "Brahmanbaria", bn: "ব্রাহ্মণবাড়িয়া" },
  { en: "Cumilla", bn: "কুমিল্লা" },
  { en: "Chandpur", bn: "চাঁদপুর" },
  { en: "Noakhali", bn: "নোয়াখালী" },
  { en: "Feni", bn: "ফেনী" },
  { en: "Chattogram", bn: "চট্টগ্রাম" },
  { en: "Cox's Bazar", bn: "কক্সবাজার" },
  { en: "Rangamati", bn: "রাঙ্গামাটি" },
  { en: "Khagrachhari", bn: "খাগড়াছড়ি" },
  { en: "Bandarban", bn: "বান্দরবান" },
  { en: "Lakshmipur", bn: "লক্ষ্মীপুর" },
  { en: "Dhaka", bn: "ঢাকা" },
  { en: "Gazipur", bn: "গাজীপুর" },
  { en: "Narayanganj", bn: "নারায়ণগঞ্জ" },
  { en: "Narsingdi", bn: "নরসিংদী" },
  { en: "Tangail", bn: "টাঙ্গাইল" },
  { en: "Mymensingh", bn: "ময়মনসিংহ" },
  { en: "Jamalpur", bn: "জামালপুর" },
  { en: "Sherpur", bn: "শেরপুর" },
  { en: "Bogura", bn: "বগুড়া" },
  { en: "Rajshahi", bn: "রাজশাহী" },
  { en: "Natore", bn: "নাটোর" },
  { en: "Naogaon", bn: "নওগাঁ" },
  { en: "Joypurhat", bn: "জয়পুরহাট" },
  { en: "Chapainawabganj", bn: "চাঁপাইনবাবগঞ্জ" },
  { en: "Pabna", bn: "পাবনা" },
  { en: "Sirajganj", bn: "সিরাজগঞ্জ" },
  { en: "Rangpur", bn: "রংপুর" },
  { en: "Dinajpur", bn: "দিনাজপুর" },
  { en: "Thakurgaon", bn: "ঠাকুরগাঁও" },
  { en: "Panchagarh", bn: "পঞ্চগড়" },
  { en: "Nilphamari", bn: "নীলফামারী" },
  { en: "Lalmonirhat", bn: "লালমনিরহাট" },
  { en: "Kurigram", bn: "কুড়িগ্রাম" },
  { en: "Gaibandha", bn: "গাইবান্ধা" },
  { en: "Khulna", bn: "খুলনা" },
  { en: "Jashore", bn: "যশোর" },
  { en: "Satkhira", bn: "সাতক্ষীরা" },
  { en: "Bagerhat", bn: "বাগেরহাট" },
  { en: "Jhenaidah", bn: "ঝিনাইদহ" },
  { en: "Chuadanga", bn: "চুয়াডাঙ্গা" },
  { en: "Meherpur", bn: "মেহেরপুর" },
  { en: "Kushtia", bn: "কুষ্টিয়া" },
  { en: "Magura", bn: "মাগুরা" },
  { en: "Narail", bn: "নড়াইল" },
  { en: "Barishal", bn: "বরিশাল" },
  { en: "Bhola", bn: "ভোলা" },
  { en: "Patuakhali", bn: "পটুয়াখালী" },
  { en: "Pirojpur", bn: "পিরোজপুর" },
  { en: "Barguna", bn: "বরগুনা" },
  { en: "Jhalokati", bn: "ঝালকাঠি" },
  { en: "Faridpur", bn: "ফরিদপুর" },
  { en: "Gopalganj", bn: "গোপালগঞ্জ" },
  { en: "Madaripur", bn: "মাদারীপুর" },
  { en: "Shariatpur", bn: "শরীয়তপুর" },
  { en: "Rajbari", bn: "রাজবাড়ী" },
  { en: "Manikganj", bn: "মানিকগঞ্জ" },
  { en: "Munshiganj", bn: "মুন্সিগঞ্জ" },
];

/**
 * Upazilas of Sunamganj district (the only fully serviced district).
 * Sunamganj Sadar first — it has the selectable para list.
 */
export const SUNAMGANJ_UPAZILAS: GeoOption[] = [
  { en: "Sunamganj Sadar", bn: "সুনামগঞ্জ সদর" },
  { en: "Shantiganj (Dakshin Sunamganj)", bn: "শান্তিগঞ্জ (দক্ষিণ সুনামগঞ্জ)" },
  { en: "Balaiganj", bn: "বালাগঞ্জ" },
  { en: "Bishwamvarpur", bn: "বিশ্বম্বরপুর" },
  { en: "Chhatak", bn: "ছাতক" },
  { en: "Derai", bn: "দিরাই" },
  { en: "Dharampasha", bn: "ধর্মপাশা" },
  { en: "Dowarabazar", bn: "দোয়ারাবাজার" },
  { en: "Jagannathpur", bn: "জগন্নাথপুর" },
  { en: "Jamalganj", bn: "জামালগঞ্জ" },
  { en: "Sullah", bn: "শাল্লা" },
  { en: "Tahirpur", bn: "তাহিরপুর" },
];

/** Sentinel option in the para select — "I'll type my para myself". */
export const PARA_CUSTOM = "__other__";

export interface ParaOption {
  name: string;
  zoneId: string;
}

/**
 * Selectable paras for the "songlisto" (selected) upazila — Sunamganj Sadar.
 * Every option knows its zone, so picking a para prices the delivery.
 */
export const SADAR_PARA_OPTIONS: ParaOption[] = [
  ...SUNAMGANJ_ZONES[0].areas.map((name) => ({ name, zoneId: "z1" })),
  ...SUNAMGANJ_ZONES[1].areas.map((name) => ({ name, zoneId: "z2" })),
  ...SUNAMGANJ_ZONES[2].areas.map((name) => ({ name, zoneId: "z3" })),
];

/**
 * Derive the delivery zone from the simple form picks.
 *
 *  • Sunamganj + Sunamganj Sadar + para from the A list → z1 (free-delivery zone)
 *  • Sadar para from the B / C lists                    → z2 / z3
 *  • Sunamganj Sadar, unlisted para (typed)             → z3 (Sadar extended)
 *  • Sunamganj, any other upazila                       → z4 (outside Sadar)
 *  • Any other district                                 → z4 (courier)
 */
export const deriveZoneChoice = (
  district: string,
  upazila: string,
  para: string,
): { zoneId: string; paraListed: boolean } => {
  const d = district.trim().toLowerCase();
  const u = upazila.trim().toLowerCase();
  const p = para.trim().toLowerCase();

  if (d !== SUNAMGANJ_DISTRICT.toLowerCase() || u !== SUNAMGANJ_UPAZILA.toLowerCase()) {
    return { zoneId: "z4", paraListed: false };
  }
  const exact = SADAR_PARA_OPTIONS.find((o) => o.name.toLowerCase() === p);
  if (exact) return { zoneId: exact.zoneId, paraListed: true };
  const loose = findZoneByPara(para);
  if (loose && loose.id !== "z4") return { zoneId: loose.id, paraListed: true };
  return { zoneId: "z3", paraListed: false };
};

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
