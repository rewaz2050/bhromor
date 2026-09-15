import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON,
  availabilityLabel,
  isOnShift,
  sanitizeAvailability,
} from "../rider-hours";

/* Anchors built as UTC instants, read back as Asia/Dhaka (+6). */
const ms = (utcHour: number, day = Date.UTC(2026, 3, 17)) => day + utcHour * 3600_000;
// Fri 2026-04-17 in Dhaka: 12:00 local = 06:00 UTC; 22:00 local = 16:00 UTC.
const FRI_NOON = ms(6);
const FRI_10PM = ms(16);

describe("isOnShift — one rule, two surfaces", () => {
  it("always-on riders are never skipped", () => {
    expect(isOnShift(ALWAYS_ON, FRI_NOON)).toBe(true);
    expect(isOnShift(undefined, FRI_NOON)).toBe(true);
  });

  it("a plain [from, to) window — end hour itself is off-limits", () => {
    const evening = { fromHour: 18, toHour: 22, days: null };
    expect(isOnShift(evening, FRI_10PM - 3600_000)).toBe(true); // 21:xx
    expect(isOnShift(evening, FRI_10PM)).toBe(false); // exactly 22:00 — off
  });

  it("night shifts wrap past midnight (10PM–6AM)", () => {
    const night = { fromHour: 22, toHour: 6, days: null };
    expect(isOnShift(night, FRI_10PM)).toBe(true); // 22:00 Friday
    expect(isOnShift(night, Date.UTC(2026, 3, 17, 19, 0))).toBe(true); // 19:00 UTC → Sat 01:00 Dhaka
    expect(isOnShift(night, FRI_NOON)).toBe(false); // Fri 12:00 — off
  });

  it("weekday gates use the Dhaka date line, not the browser's", () => {
    const friOnly = { fromHour: null, toHour: null, days: [5] };
    expect(isOnShift(friOnly, FRI_NOON)).toBe(true);
    // Sat 00:30 in Dhaka = 18:30 UTC Friday — still Saturday for the gate:
    const satEarly = Date.UTC(2026, 3, 17, 18, 30);
    expect(isOnShift(friOnly, satEarly)).toBe(false);
  });

  it("an empty shift (from == to) matches nothing, like the SQL rule", () => {
    expect(isOnShift({ fromHour: 18, toHour: 18, days: null }, FRI_NOON)).toBe(false);
  });

  it("open-ended halves work (from set, to unset = till midnight)", () => {
    expect(isOnShift({ fromHour: 18, toHour: null, days: null }, FRI_NOON)).toBe(false);
    expect(isOnShift({ fromHour: 18, toHour: null, days: null }, FRI_10PM)).toBe(true);
    expect(isOnShift({ fromHour: null, toHour: 9, days: null }, FRI_NOON)).toBe(false);
  });
});

describe("sanitizeAvailability — the API's only door", () => {
  it("accepts the rider card's honest shapes", () => {
    expect(sanitizeAvailability({ fromHour: 18, toHour: 22, days: [5, 6] }).value).toEqual({
      fromHour: 18,
      toHour: 22,
      days: [5, 6],
    });
    expect(sanitizeAvailability({ fromHour: "", toHour: null, days: [] }).value).toEqual({
      fromHour: null,
      toHour: null,
      days: null,
    });
  });

  it("refuses equal bounds with guidance instead of silently disabling dispatch", () => {
    const out = sanitizeAvailability({ fromHour: 18, toHour: 18, days: null });
    expect(out.error).toMatch(/no shift at all/);
    expect(out.value).toEqual(ALWAYS_ON); // never a half-saved broken shift
  });

  it("rejects nonsense hours and days, falling back to always-on untouched", () => {
    expect(sanitizeAvailability({ fromHour: 25, toHour: null, days: null }).error).toMatch(/0–23/);
    expect(sanitizeAvailability({ fromHour: 8, toHour: 30, days: null }).error).toMatch(/0–24/);
    expect(sanitizeAvailability({ fromHour: 8, toHour: 12, days: [9] }).error).toMatch(/weekday/);
    expect(sanitizeAvailability(null).error).toBeUndefined(); // no body → always on
  });

  it("dedupes days", () => {
    expect(sanitizeAvailability({ fromHour: null, toHour: null, days: [3, 3, 1] }).value.days).toEqual([1, 3]);
  });
});

describe("availabilityLabel — what both screens say out loud", () => {
  it("reads like a person wrote it", () => {
    expect(availabilityLabel(ALWAYS_ON)).toBe("Anytime");
    expect(availabilityLabel({ fromHour: 18, toHour: 22, days: [5, 6] })).toBe("6PM–10PM · Fri,Sat");
    expect(availabilityLabel({ fromHour: null, toHour: null, days: [0] })).toBe("Anytime · Sun");
    expect(availabilityLabel({ fromHour: 0, toHour: 24, days: null })).toBe("12AM–12AM");
  });
});
