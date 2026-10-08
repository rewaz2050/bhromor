/**
 * Dates printed the shop's way (flicker pass 2026-10-07).
 *
 * A formatter without a time zone answers from the machine it runs on: the
 * server (UTC) says one day, a browser in Dhaka says the next, and six hours
 * out of every Bangladeshi day the two disagree — the HTML carries one date
 * and hydration repaints another.
 */
import { describe, expect, it } from "vitest";
import { SHOP_TIME_ZONE, formatShopDate } from "../format";

/** 2026-10-07 20:30 Dhaka = 2026-10-07 14:30 UTC (same day). */
const EVENING = Date.UTC(2026, 9, 7, 14, 30);
/** 2026-10-07 23:30 Dhaka = 2026-10-07 17:30 UTC — still the same day. */
const LATE = Date.UTC(2026, 9, 7, 17, 30);
/** 2026-10-07 03:30 Dhaka = 2026-10-06 21:30 UTC — a DIFFERENT day in UTC. */
const EARLY = Date.UTC(2026, 9, 6, 21, 30);

describe("formatShopDate", () => {
  it("is pinned to the shop's zone", () => {
    expect(SHOP_TIME_ZONE).toBe("Asia/Dhaka");
    // 03:30 Dhaka is the 7th here, and would be the 6th in UTC.
    expect(formatShopDate(EARLY, { day: "numeric", month: "short", year: "numeric" })).toBe(
      "7 Oct 2026",
    );
    expect(formatShopDate(LATE, { day: "numeric", month: "short", year: "numeric" })).toBe(
      "7 Oct 2026",
    );
  });

  it("reads ISO strings and Dates the same way", () => {
    const iso = new Date(EVENING).toISOString();
    expect(formatShopDate(iso, { hour: "2-digit", minute: "2-digit", hour12: false })).toBe(
      formatShopDate(EVENING, { hour: "2-digit", minute: "2-digit", hour12: false }),
    );
    expect(formatShopDate(new Date(EVENING), { day: "numeric" })).toBe("7");
  });

  it("prints nothing for a timestamp that is not one", () => {
    expect(formatShopDate(Number.NaN)).toBe("");
    expect(formatShopDate("not a date")).toBe("");
  });
});
