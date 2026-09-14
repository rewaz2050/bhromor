/**
 * Rider gig flexibility (P2 #22) — "I only ride 6–10PM".
 *
 * A gig rider in Sunamganj is usually a student, a shopkeeper after hours,
 * someone with a second life. The dispatch queue already honours availability
 * IN THE DATABASE (`ps_rider_on_shift`, migration 202609140014) so an
 * off-shift rider is never offered a job even if their app tab is open; the
 * math here is the SAME rule in TypeScript for the two UIs that must agree
 * with it (rider app, admin riders list) — same buckets, same wrap.
 *
 * Semantics (deliberately simple):
 *   • hours are Asia/Dhaka clock hours; a shift is [from, to) — "6PM–10PM"
 *     gets offers up to 9:59PM and the 10PM one belongs to tomorrow's shift.
 *   • from > to = a night shift that wraps past midnight (10PM–6AM).
 *   • null/null (or both unset) = any hour. days null/empty = any day.
 */

import { dhakaHour, dhakaWeekday } from "./insights";

export interface RiderAvailability {
  /** inclusive start hour 0–23; null = from midnight */
  fromHour: number | null;
  /** exclusive end hour 1–24 (24 = midnight); null = to midnight */
  toHour: number | null;
  /** 0=Sunday..6=Saturday; null or [] = every day */
  days: number[] | null;
}

export const ALWAYS_ON: RiderAvailability = {
  fromHour: null,
  toHour: null,
  days: null,
};

export const isOnShift = (
  a: RiderAvailability | undefined,
  nowMs: number = Date.now(),
): boolean => {
  const av = a ?? ALWAYS_ON;
  if (av.days && av.days.length > 0 && !av.days.includes(dhakaWeekday(nowMs))) {
    return false;
  }
  const hour = dhakaHour(nowMs);
  const from = av.fromHour ?? null;
  const to = av.toHour ?? null;
  if (from === null && to === null) return true;
  if (from !== null && to !== null && from === to) return false; // empty shift
  if (from !== null && to !== null && from > to) {
    // night shift wrapping midnight: on from `from`, off at `to`
    return hour >= from || hour < to;
  }
  const lo = from ?? 0;
  const hi = to ?? 24;
  return hour >= lo && hour < hi;
};

export interface SanitizedAvailability {
  value: RiderAvailability;
  error?: string;
}

const hourOrNull = (v: unknown, field: string, maxExclusive: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > maxExclusive) {
    throw new Error(`${field} must be a whole hour 0–${maxExclusive}.`);
  }
  return n;
};

/** Validate + normalize a rider's saved availability. Throws on garbage;
 *  the API maps that to a 422 with the message. */
export const sanitizeAvailability = (raw: unknown): SanitizedAvailability => {
  try {
    const r = (raw ?? {}) as Record<string, unknown>;
    const fromHour = hourOrNull(r.fromHour, "Start hour", 23);
    const toHour = hourOrNull(r.toHour, "End hour", 24);
    let days: number[] | null = null;
    if (Array.isArray(r.days)) {
      const seen = new Set<number>();
      for (const d of r.days) {
        const n = Number(d);
        if (!Number.isInteger(n) || n < 0 || n > 6) {
          throw new Error("Days must be weekday numbers 0–6.");
        }
        seen.add(n);
      }
      // an empty selection is "any day" — normalize to null like the DB does
      days = seen.size === 0 ? null : [...seen].sort((a, b) => a - b);
    }
    if (fromHour !== null && toHour !== null && fromHour === toHour) {
      return {
        value: ALWAYS_ON,
        error: "A shift that starts and ends the same hour is no shift at all — pick a range, or clear both.",
      };
    }
    const value: RiderAvailability = {
      fromHour,
      toHour: toHour === 24 ? 24 : toHour, // 24 kept: "till midnight" reads honestly
      days,
    };
    return { value };
  } catch (err) {
    return { value: ALWAYS_ON, error: err instanceof Error ? err.message : "Invalid availability." };
  }
};

const fmtHour = (h: number): string => {
  if (h === 0 || h === 24) return "12AM";
  if (h === 12) return "12PM";
  return h > 12 ? `${h - 12}PM` : `${h}AM`;
};

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Compact human label for cards and lists. */
export const availabilityLabel = (a: RiderAvailability | undefined): string => {
  const av = a ?? ALWAYS_ON;
  const days = av.days && av.days.length > 0 && av.days.length < 7
    ? ` · ${av.days.map((d) => SHORT_DAYS[d] ?? "?").join(",")}`
    : "";
  if (av.fromHour === null && av.toHour === null) return `Anytime${days}`;
  const from = fmtHour(av.fromHour ?? 0);
  const to = fmtHour(av.toHour ?? 24);
  return `${from}–${to}${days}`;
};
