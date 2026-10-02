import { describe, expect, it } from "vitest";
import {
  FRESH_MS, STALE_AFTER_IDLE_MS, STALE_AFTER_TRIP_MS, STALE_MS,
  freshnessLabel, geoErrorKind, locationFreshness, trackingNotice, trackingState, type TrackingInput,
} from "../location-health";

const NOW = 1_000_000_000;
const base: TrackingInput = { enabled: true, hasActiveTrip: false, permission: null, lastError: null, lastFixAt: NOW - 10_000, sendFailed: false, now: NOW };

describe("geoErrorKind", () => {
  it("maps the three browser codes", () => {
    expect(geoErrorKind(1)).toBe("denied");
    expect(geoErrorKind(2)).toBe("unavailable");
    expect(geoErrorKind(3)).toBe("timeout");
    expect(geoErrorKind(99)).toBe("unavailable");
  });
});

describe("trackingState", () => {
  it("is off when offline / signed out, whatever else is true", () => {
    expect(trackingState({ ...base, enabled: false, permission: "denied" })).toBe("off");
  });
  it("is ok with a recent fix", () => expect(trackingState(base)).toBe("ok"));
  it("denied wins — from the permission or from the last error", () => {
    expect(trackingState({ ...base, permission: "denied" })).toBe("denied");
    expect(trackingState({ ...base, lastError: "denied", lastFixAt: null })).toBe("denied");
  });
  it("is 'starting' until the first fix, 'unavailable' if the first attempts fail", () => {
    expect(trackingState({ ...base, lastFixAt: null })).toBe("starting");
    expect(trackingState({ ...base, lastFixAt: null, lastError: "timeout" })).toBe("starting");
    expect(trackingState({ ...base, lastFixAt: null, lastError: "unavailable" })).toBe("unavailable");
  });
  it("goes stale after 3 min on a trip but only after 6 min when idle", () => {
    const at = (age: number, trip: boolean) => trackingState({ ...base, hasActiveTrip: trip, lastFixAt: NOW - age });
    expect(at(STALE_AFTER_TRIP_MS, true)).toBe("ok");
    expect(at(STALE_AFTER_TRIP_MS + 1, true)).toBe("stale");
    expect(at(STALE_AFTER_TRIP_MS + 1, false)).toBe("ok");
    expect(at(STALE_AFTER_IDLE_MS + 1, false)).toBe("stale");
  });
  it("a stale signal with GPS errors is 'unavailable', not just stale", () => {
    expect(trackingState({ ...base, lastFixAt: NOW - STALE_AFTER_IDLE_MS - 1, lastError: "unavailable" })).toBe("unavailable");
  });
  it("a failed upload is flagged only while fixes still arrive", () => {
    expect(trackingState({ ...base, sendFailed: true })).toBe("send_failed");
    expect(trackingState({ ...base, sendFailed: true, lastFixAt: NOW - STALE_AFTER_IDLE_MS - 1 })).toBe("stale");
  });
});

describe("trackingNotice", () => {
  it("says nothing when healthy or not applicable", () => {
    for (const s of ["off", "starting", "ok"] as const) expect(trackingNotice(s, true)).toBeNull();
  });
  it("denied is a red alert whose hint depends on whether a trip is running", () => {
    expect(trackingNotice("denied", true)).toMatchObject({ tone: "bad" });
    expect(trackingNotice("denied", true)?.hint).toMatch(/কাস্টমার/);
    expect(trackingNotice("denied", false)?.hint).toMatch(/অফার/);
  });
  it("every other problem is an amber warning with a way out", () => {
    for (const s of ["unavailable", "stale", "send_failed"] as const) {
      const n = trackingNotice(s, true);
      expect(n?.tone).toBe("warn");
      expect(n?.hint.length).toBeGreaterThan(10);
    }
    expect(trackingNotice("stale", true)?.hint).toMatch(/স্ক্রিন জাগিয়ে/);
  });
});

describe("locationFreshness", () => {
  const iso = (age: number) => new Date(NOW - age).toISOString();
  it("is live up to 2 min, recent up to 5 min, then stale", () => {
    expect(locationFreshness(iso(30_000), NOW)).toEqual({ level: "live", minutes: 0 });
    expect(locationFreshness(iso(FRESH_MS), NOW).level).toBe("live");
    expect(locationFreshness(iso(FRESH_MS + 1000), NOW)).toMatchObject({ level: "recent", minutes: 2 });
    expect(locationFreshness(iso(STALE_MS), NOW).level).toBe("recent");
    expect(locationFreshness(iso(STALE_MS + 1000), NOW)).toMatchObject({ level: "stale", minutes: 5 });
  });
  it("accepts epoch numbers, ignores a clock that is behind, and says unknown for junk", () => {
    expect(locationFreshness(NOW - 60_000, NOW).level).toBe("live");
    expect(locationFreshness(iso(-60_000), NOW)).toEqual({ level: "live", minutes: 0 });
    for (const bad of [null, undefined, "", "not a date"]) expect(locationFreshness(bad, NOW)).toEqual({ level: "unknown", minutes: null });
  });
  it("labels in Bangla digits", () => {
    expect(freshnessLabel({ level: "live", minutes: 0 })).toBe("এইমাত্র");
    expect(freshnessLabel({ level: "recent", minutes: 12 })).toBe("১২ মিনিট আগে");
    expect(freshnessLabel({ level: "unknown", minutes: null })).toBe("");
  });
});
