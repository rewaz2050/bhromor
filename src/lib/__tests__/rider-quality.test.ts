import { describe, expect, it } from "vitest";
import {
  assessScorecard,
  autoSuspendReason,
  normalizeScorecards,
  parseAutoSuspend,
  rankScorecards,
  type Scorecard,
} from "../rider-quality";

const NOW = Date.parse("2026-10-02T06:00:00.000Z");
const H = 3_600_000;
const card = (over: Partial<Scorecard> = {}): Scorecard => ({
  id: "r1", name: "Rafiq", vehicle: "bike", isOnline: true, ratingAvg: 0, ratingCount: 0, cashInHand: 0,
  currentLoad: 0, createdAt: 0, pendingClaim: false, lastSettledAt: null, oldestCodAt: null,
  offered: 0, delivered: 0, failed: 0, declined: 0, expired: 0, avgDeliveryMinutes: null, ...over,
});
const CAP = 500_000;

describe("normalizeScorecards", () => {
  it("keeps valid rows, coerces numbers and dates, drops junk", () => {
    const rows = normalizeScorecards([
      { id: "a", name: "A", ratingAvg: "4.5", delivered: "3", oldestCodAt: "2026-10-01T00:00:00Z", pendingClaim: true },
      { name: "no id" },
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ratingAvg: 4.5, delivered: 3, pendingClaim: true, oldestCodAt: Date.parse("2026-10-01T00:00:00Z") });
    expect(normalizeScorecards("nope")).toEqual([]);
  });
});

describe("assessScorecard", () => {
  it("has no score (grade new) until there is history, and never invents flags", () => {
    const a = assessScorecard(card({ delivered: 2, offered: 2 }), CAP, NOW);
    expect(a).toMatchObject({ score: null, grade: "new", successRate: null, acceptRate: null, flags: [] });
  });

  it("scores a reliable, responsive, well-rated rider an A", () => {
    const a = assessScorecard(card({ delivered: 30, failed: 1, offered: 34, declined: 2, expired: 1, ratingAvg: 4.8, ratingCount: 20 }), CAP, NOW);
    expect(a.grade).toBe("A");
    expect(a.score).toBeGreaterThanOrEqual(90);
    expect(a.flags).toEqual([]);
  });

  it("re-weights over the parts that have data (rating only)", () => {
    const a = assessScorecard(card({ ratingAvg: 4, ratingCount: 5 }), CAP, NOW);
    expect(a.score).toBe(80);
    expect(a.grade).toBe("B");
  });

  it("flags failures, low acceptance and a low rating separately", () => {
    const a = assessScorecard(card({ delivered: 6, failed: 4, offered: 12, declined: 4, expired: 3, ratingAvg: 2.5, ratingCount: 6 }), CAP, NOW);
    expect(a.flags.map((f) => f.code).sort()).toEqual(["fail-rate", "low-accept", "low-rating"]);
    expect(a.grade).toBe("D");
  });

  it("penalises old unsettled COD and a rider stuck at the cash cap", () => {
    const base = card({ delivered: 20, offered: 20, cashInHand: 100_000 });
    const clean = assessScorecard(base, CAP, NOW);
    const stale = assessScorecard({ ...base, oldestCodAt: NOW - 50 * H }, CAP, NOW);
    expect(clean.score! - stale.score!).toBe(15);
    expect(stale.flags).toContainEqual(expect.objectContaining({ code: "cod-old", level: "high" }));
    const capped = assessScorecard({ ...base, cashInHand: CAP }, CAP, NOW);
    expect(capped.flags.map((f) => f.code)).toContain("cash-capped");
    expect(assessScorecard({ ...base, oldestCodAt: NOW - 30 * H }, CAP, NOW).flags[0]).toMatchObject({ level: "watch", code: "cod-old" });
  });
});

describe("autoSuspendReason — hard rules only", () => {
  it("fires on COD held 4+ days with no claim waiting; a pending claim protects the rider", () => {
    const c = card({ cashInHand: 200_000, oldestCodAt: NOW - 100 * H });
    expect(autoSuspendReason(c, NOW)).toMatch(/unsettled for 4\+ days/);
    expect(autoSuspendReason({ ...c, pendingClaim: true }, NOW)).toBeNull();
    expect(autoSuspendReason({ ...c, oldestCodAt: NOW - 90 * H }, NOW)).toBeNull();
    expect(autoSuspendReason({ ...c, cashInHand: 0 }, NOW)).toBeNull();
  });
  it("fires on a high failure share only with enough closed jobs", () => {
    expect(autoSuspendReason(card({ delivered: 4, failed: 4 }), NOW)).toMatch(/4 of 8/);
    expect(autoSuspendReason(card({ delivered: 1, failed: 5 }), NOW)).toBeNull(); // 6 < 8 closed
    expect(autoSuspendReason(card({ delivered: 5, failed: 3 }), NOW)).toBeNull(); // 37%
  });
  it("fires on a terrible rating only with enough ratings", () => {
    expect(autoSuspendReason(card({ ratingAvg: 1.6, ratingCount: 12 }), NOW)).toMatch(/1\.6/);
    expect(autoSuspendReason(card({ ratingAvg: 1.6, ratingCount: 9 }), NOW)).toBeNull();
    expect(autoSuspendReason(card({ ratingAvg: 0, ratingCount: 12 }), NOW)).toBeNull();
  });
  it("shows up as a flag on the board", () => {
    const a = assessScorecard(card({ delivered: 4, failed: 4 }), CAP, NOW);
    expect(a.flags.map((f) => f.code)).toContain("auto-suspend");
  });
});

describe("rankScorecards / parseAutoSuspend", () => {
  it("lists the worst first and unscored riders last", () => {
    const ranked = rankScorecards(
      [
        card({ id: "new", name: "Newbie" }),
        card({ id: "good", name: "Good", delivered: 20, offered: 20 }),
        card({ id: "bad", name: "Bad", delivered: 5, failed: 5, offered: 10 }),
      ],
      CAP,
      NOW,
    );
    expect(ranked.map((r) => r.card.id)).toEqual(["bad", "good", "new"]);
  });
  it("auto-suspend is OFF unless explicitly on", () => {
    expect([true, "true", 1].map(parseAutoSuspend)).toEqual([true, true, true]);
    expect([false, "false", 0, null, undefined, "yes", {}].map(parseAutoSuspend)).toEqual(Array(7).fill(false));
  });
});
