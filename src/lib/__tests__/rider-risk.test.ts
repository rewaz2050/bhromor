import { describe, expect, it } from "vitest";
import { assessRisk, normalizeOverview, type RiderOverview } from "../rider-risk";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;

const base = (over: { risk?: Partial<RiderOverview["risk"]>; performance?: Partial<RiderOverview["performance"]> } = {}): RiderOverview => {
  const o = normalizeOverview({ rider: { id: "r1", name: "Rafiq" } }) as RiderOverview;
  return { ...o, risk: { ...o.risk, ...over.risk }, performance: { ...o.performance, ...over.performance } };
};

describe("normalizeOverview", () => {
  it("is null without a rider and tolerant of junk / missing sections", () => {
    expect(normalizeOverview(null)).toBeNull();
    expect(normalizeOverview({ rider: {} })).toBeNull();
    const o = normalizeOverview({ rider: { id: "r1", name: "R", zoneIds: ["z1", 5] }, money: { cashInHand: "1200" }, trips: [{ id: "t", state: "weird" }], journal: "x" }) as RiderOverview;
    expect(o.rider.zoneIds).toEqual(["z1"]);
    expect(o.money.cashInHand).toBe(1200);
    expect(o.risk.cashLimit).toBe(500000);
    expect(o.trips[0].state).toBe("delivered");
    expect(o.journal).toEqual([]);
    expect(o.risk.pendingClaim).toBeNull();
  });

  it("converts timestamps and the pending claim", () => {
    const o = normalizeOverview({
      rider: { id: "r1", createdAt: "2026-10-01T00:00:00Z" },
      risk: { oldestCodAt: "2026-10-01T00:00:00Z", pendingClaim: { id: "c", amount: 500, method: "bkash", reference: "T", at: "2026-10-02T00:00:00Z" } },
    }) as RiderOverview;
    expect(o.rider.createdAt).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(o.risk.oldestCodAt).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(o.risk.pendingClaim).toMatchObject({ amount: 500, method: "bkash" });
  });
});

describe("assessRisk", () => {
  it("a rider with no cash and a clean record is ok", () => {
    expect(assessRisk(base(), NOW)).toMatchObject({ level: "ok", reasons: [], cashPct: 0, oldestCodHours: null });
  });

  it("cash against the cap: 50% watch, 80% high, 100% blocked", () => {
    expect(assessRisk(base({ risk: { cashInHand: 250000 } }), NOW).level).toBe("watch");
    expect(assessRisk(base({ risk: { cashInHand: 400000 } }), NOW).level).toBe("high");
    const full = assessRisk(base({ risk: { cashInHand: 500000 } }), NOW);
    expect(full.level).toBe("high");
    expect(full.reasons[0].text).toContain("বন্ধ");
  });

  it("the age of the oldest unsettled COD: 24h watch, 48h high — only while cash is held", () => {
    expect(assessRisk(base({ risk: { cashInHand: 10000, oldestCodAt: hoursAgo(30) } }), NOW).level).toBe("watch");
    expect(assessRisk(base({ risk: { cashInHand: 10000, oldestCodAt: hoursAgo(50) } }), NOW).level).toBe("high");
    expect(assessRisk(base({ risk: { cashInHand: 10000, oldestCodAt: hoursAgo(5) } }), NOW).level).toBe("ok");
    expect(assessRisk(base({ risk: { cashInHand: 0, oldestCodAt: hoursAgo(90) } }), NOW).level).toBe("ok");
  });

  it("flags a stale pending claim and repeated rejected claims", () => {
    const stale = assessRisk(base({ risk: { pendingClaim: { id: "c", amount: 1, method: "cash", reference: "", at: hoursAgo(60) } } }), NOW);
    expect(stale.level).toBe("watch");
    expect(assessRisk(base({ risk: { pendingClaim: { id: "c", amount: 1, method: "cash", reference: "", at: hoursAgo(5) } } }), NOW).level).toBe("ok");
    expect(assessRisk(base({ risk: { rejectedClaims30: 2 } }), NOW).level).toBe("watch");
    expect(assessRisk(base({ risk: { rejectedClaims30: 1 } }), NOW).level).toBe("ok");
  });

  it("flags a high failure rate only with enough attempts, and ignored offers", () => {
    expect(assessRisk(base({ performance: { delivered30: 6, failed30: 2 } }), NOW).level).toBe("watch");
    expect(assessRisk(base({ performance: { delivered30: 1, failed30: 1 } }), NOW).level).toBe("ok");
    expect(assessRisk(base({ performance: { expired30: 5 } }), NOW).level).toBe("watch");
  });

  it("the worst reason decides the level", () => {
    const a = assessRisk(base({ risk: { cashInHand: 450000, rejectedClaims30: 3 } }), NOW);
    expect(a.level).toBe("high");
    expect(a.reasons.length).toBe(2);
  });
});
