import "server-only";

/**
 * Staff view of a rider's GPS-jump alerts (migration 202610020019). Read through the CALLER's
 * client: the table's RLS policy (`ps_is_admin()`) is the real gate. A database without the
 * migration answers `ready: false` so the card can say which file to run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";

export interface GpsFlag {
  id: string;
  at: string;
  distanceKm: number;
  seconds: number;
  speedKmh: number;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

export interface RiderGpsFlags {
  ready: boolean;
  flags: GpsFlag[];
  /** Flags in the last 30 days (the list itself shows at most 20). */
  last30Days: number;
}

const LIST_LIMIT = 20;
const DAY_MS = 86_400_000;

export const getRiderGpsFlags = async (
  db: SupabaseClient,
  riderId: string,
  nowMs: number = Date.now(),
): Promise<RiderGpsFlags> => {
  const { data, error } = await db
    .from("rider_gps_flags")
    .select("id, created_at, from_lat, from_lng, to_lat, to_lng, distance_m, seconds, speed_kmh")
    .eq("rider_id", riderId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    if (isMissingDbObject(error)) return { ready: false, flags: [], last30Days: 0 };
    throw new Error("Could not read GPS alerts.");
  }
  const rows = (data ?? []) as {
    id: string;
    created_at: string;
    from_lat: number;
    from_lng: number;
    to_lat: number;
    to_lng: number;
    distance_m: number;
    seconds: number;
    speed_kmh: number;
  }[];
  const flags = rows.map((r) => ({
    id: r.id,
    at: r.created_at,
    distanceKm: Math.round((Number(r.distance_m) / 1000) * 10) / 10,
    seconds: Number(r.seconds),
    speedKmh: Number(r.speed_kmh),
    from: { lat: Number(r.from_lat), lng: Number(r.from_lng) },
    to: { lat: Number(r.to_lat), lng: Number(r.to_lng) },
  }));
  const cutoff = nowMs - 30 * DAY_MS;
  // The list is newest-first and capped, so count the window from a head-only query when full.
  let last30Days = flags.filter((f) => Date.parse(f.at) >= cutoff).length;
  if (flags.length >= LIST_LIMIT) {
    const { count } = await db
      .from("rider_gps_flags")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", riderId)
      .gte("created_at", new Date(cutoff).toISOString());
    if (typeof count === "number") last30Days = count;
  }
  return { ready: true, flags, last30Days };
};
