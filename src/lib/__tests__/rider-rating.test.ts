import { describe, expect, it } from "vitest";
import { summarizeRatings } from "../rider-rating";

const NOW = Date.parse("2026-10-02T10:00:00Z");
const day = 86_400_000;
const r = (stars: number, daysAgo: number, orderNo?: string) => ({ stars, at: NOW - daysAgo * day, orderNo });

describe("summarizeRatings", () => {
  it("is all zero for no ratings", () => {
    expect(summarizeRatings([], NOW)).toEqual({ count: 0, avg: 0, distribution: [0, 0, 0, 0, 0], last30: { count: 0, avg: 0 }, low: [] });
  });

  it("spreads the stars and averages to one decimal", () => {
    const s = summarizeRatings([r(5, 1), r(5, 2), r(4, 3), r(1, 4)], NOW);
    expect(s.distribution).toEqual([1, 0, 0, 1, 2]);
    expect(s.count).toBe(4);
    expect(s.avg).toBe(3.8);
  });

  it("separates the last 30 days from lifetime", () => {
    const s = summarizeRatings([r(5, 5), r(3, 10), r(1, 60)], NOW);
    expect(s.last30).toEqual({ count: 2, avg: 4 });
    expect(s.avg).toBe(3);
  });

  it("lists the newest low-star deliveries, at most five, ignoring junk stars", () => {
    const rows = [r(2, 1, "A"), r(1, 2, "B"), r(2, 3), r(1, 4), r(2, 5), r(1, 6, "Z"), r(5, 0), r(9, 0), r(0, 0)];
    const s = summarizeRatings(rows, NOW);
    expect(s.count).toBe(7);
    expect(s.low).toHaveLength(5);
    expect(s.low[0].orderNo).toBe("A");
    expect(s.low.map((l) => l.orderNo)).not.toContain("Z");
  });
});
