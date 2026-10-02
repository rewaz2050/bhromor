import { describe, expect, it } from "vitest";
import { coverageSummary, diagnoseCoverage, NO_TAKERS_AFTER_MIN } from "../dispatch-coverage";
import type { Rider } from "../catalog";

const NOW = Date.parse("2026-10-02T06:00:00Z"); // 12:00 in Dhaka
const MIN = 60_000;
const order = (over: Record<string, unknown> = {}) =>
  ({
    zoneId: "town", zoneName: "Town", status: "ready-for-pickup", createdAt: NOW - 60 * MIN,
    timeline: [{ status: "ready-for-pickup", at: NOW - 2 * MIN }], ...over,
  }) as never;
const rider = (over: Partial<Rider> = {}): Rider =>
  ({ id: "r", name: "R", phone: "0", vehicle: "bike", zoneIds: ["town"], status: "active", isOnline: true, cashInHand: 0, ratingAvg: 0, ratingCount: 0, currentLoad: 0, ...over }) as Rider;
const d = (o: unknown, riders: Rider[], extra = {}) => diagnoseCoverage(o as never, riders, { nowMs: NOW, ...extra });

describe("diagnoseCoverage (S)", () => {
  it("an unverified wallet payment is the cause, whatever the riders look like", () => {
    expect(d(order(), [], { awaitingVerification: true }).reason).toBe("payment");
  });

  it("nobody covers the zone → alert (pending/suspended riders do not count)", () => {
    expect(d(order(), []).reason).toBe("no-rider-in-zone");
    expect(d(order(), [rider({ zoneIds: ["other"] }), rider({ status: "pending" }), rider({ status: "suspended" })])).toMatchObject({ reason: "no-rider-in-zone", severity: "alert", covering: 0 });
  });

  it("walks the same gates as dispatch, in order", () => {
    expect(d(order(), [rider({ isOnline: false })]).reason).toBe("all-offline");
    expect(d(order(), [rider({ availability: { fromHour: 20, toHour: 22, days: null } })]).reason).toBe("off-shift");
    expect(d(order(), [rider({ cashInHand: 500000 })]).reason).toBe("cash-capped");
    expect(d(order(), [rider({ currentLoad: 2 })])).toMatchObject({ reason: "at-capacity", severity: "warn" });
  });

  it("the cash gate follows the admin-set cap, not a constant", () => {
    const r = [rider({ cashInHand: 300000 })];
    expect(d(order(), r).reason).toBe("pending-offers");
    expect(d(order(), r, { cashCap: 250000 }).reason).toBe("cash-capped");
  });

  it("one eligible rider among blocked ones is enough", () => {
    const out = d(order(), [rider({ isOnline: false }), rider({ cashInHand: 999999 }), rider({ id: "ok" })]);
    expect(out).toMatchObject({ reason: "pending-offers", severity: "info", covering: 3, online: 2, eligible: 1 });
  });

  it("eligible riders but nobody takes it for a while → no-takers warning", () => {
    const late = order({ timeline: [{ status: "ready-for-pickup", at: NOW - (NO_TAKERS_AFTER_MIN + 1) * MIN }] });
    expect(d(late, [rider()])).toMatchObject({ reason: "no-takers", severity: "warn", waitingMin: NO_TAKERS_AFTER_MIN + 1 });
  });

  it("waiting time counts from the latest 'ready', not from creation", () => {
    const re = order({ timeline: [{ status: "ready-for-pickup", at: NOW - 90 * MIN }, { status: "ready-for-pickup", at: NOW - MIN }] });
    expect(d(re, [rider()]).waitingMin).toBe(1);
  });

  it("an order that claims a rider but has no live assignment is flagged as an orphan", () => {
    const o = order({ status: "courier-assigned" });
    expect(d(o, [rider()], { hasLiveAssignment: false })).toMatchObject({ reason: "orphan", severity: "alert" });
    expect(d(o, [rider()], { hasLiveAssignment: true }).reason).not.toBe("orphan");
  });

  it("summary counts what needs a human", () => {
    const items = [d(order(), []), d(order(), [rider({ currentLoad: 2 })]), d(order(), [rider()])];
    expect(coverageSummary(items)).toEqual({ alert: 1, warn: 1 });
  });
});
