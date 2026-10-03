import { describe, expect, it } from "vitest";
import { buildCashTimeline, cashTimelineHint } from "../rider-cash-timeline";

const settlement = (id: string, at: number, extra = {}) => ({ id, amount: 100000, method: "cash", reference: "", nettedAmount: 0, at, ...extra });
const claim = (id: string, status: "pending" | "approved" | "rejected", at: number, extra = {}) => ({ id, amount: 50000, method: "bkash", reference: "TX1", status, at, ...extra });

describe("buildCashTimeline", () => {
  it("merges settlements and claims, newest first", () => {
    const out = buildCashTimeline([settlement("s1", 100)], [claim("c1", "pending", 300), claim("c2", "rejected", 50, { decidedAt: 200, note: "TRX মেলেনি" })]);
    expect(out.map((i) => [i.id, i.kind])).toEqual([["c-c1", "pending"], ["c-c2", "rejected"], ["s-s1", "settled"]]);
  });

  it("never shows an approved claim twice — its settlement is the row", () => {
    const out = buildCashTimeline([settlement("s1", 100)], [claim("c1", "approved", 90)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("settled");
  });

  it("a rejected claim is dated by the decision and carries the reason", () => {
    const [item] = buildCashTimeline([], [claim("c2", "rejected", 50, { decidedAt: 200, note: "  TRX মেলেনি " })]);
    expect(item.at).toBe(200);
    expect(item.note).toBe("TRX মেলেনি");
    expect(cashTimelineHint(item)).toContain("TRX মেলেনি");
    expect(cashTimelineHint(item)).toContain("কমেনি");
  });

  it("keeps the netted amount and caps the list", () => {
    const many = Array.from({ length: 15 }, (_, i) => settlement(`s${i}`, i, i === 14 ? { nettedAmount: 400 } : {}));
    const out = buildCashTimeline(many, [], 10);
    expect(out).toHaveLength(10);
    expect(out[0].nettedAmount).toBe(400);
    expect(cashTimelineHint(out[0])).toBe("");
  });
});
