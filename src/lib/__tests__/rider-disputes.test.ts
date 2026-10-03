import { describe, expect, it } from "vitest";
import {
  adjustmentMessage,
  disputeCategoryLabel,
  disputeDecisionMessage,
  parseAdjustInput,
  parseRaiseInput,
  parseResolveInput,
} from "../rider-disputes";

const ID = "11111111-1111-1111-1111-111111111111";

describe("parseRaiseInput", () => {
  it("accepts a trip-bound complaint, converting taka to paisa", () => {
    expect(parseRaiseInput({ category: "missing_fee", message: "  ফি আসেনি  ", assignmentId: ID, claimedTaka: "40.5" })).toEqual({
      assignmentId: ID, category: "missing_fee", message: "ফি আসেনি", claimed: 4050,
    });
  });
  it("trip-bound categories need a trip; 'other' does not", () => {
    expect(parseRaiseInput({ category: "wrong_cod", message: "customer paid less" })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "general question" })).toMatchObject({ assignmentId: null, claimed: null });
  });
  it("rejects bad category, short/long message, bad id, bad or oversized amount", () => {
    expect(parseRaiseInput({ category: "nope", message: "long enough" })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "no" })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "x".repeat(501) })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "missing_fee", message: "long enough", assignmentId: "zzz" })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "long enough", claimedTaka: "abc" })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "long enough", claimedTaka: -5 })).toHaveProperty("error");
    expect(parseRaiseInput({ category: "other", message: "long enough", claimedTaka: 60000 })).toHaveProperty("error");
    expect(parseRaiseInput(null)).toHaveProperty("error");
  });
});

describe("parseResolveInput", () => {
  it("reject needs a reason and never carries an amount", () => {
    expect(parseResolveInput({ decision: "reject", note: "no" })).toHaveProperty("error");
    expect(parseResolveInput({ decision: "reject", note: "Fee was paid", amountTaka: 50 })).toEqual({ decision: "reject", amount: 0, note: "Fee was paid" });
  });
  it("approve may acknowledge without money, or move signed money with a reason", () => {
    expect(parseResolveInput({ decision: "approve" })).toEqual({ decision: "approve", amount: 0, note: "" });
    expect(parseResolveInput({ decision: "approve", amountTaka: "40", note: "Fee missed" })).toEqual({ decision: "approve", amount: 4000, note: "Fee missed" });
    expect(parseResolveInput({ decision: "approve", amountTaka: -30, note: "Penalty applied" })).toMatchObject({ amount: -3000 });
    expect(parseResolveInput({ decision: "approve", amountTaka: 40, note: "ok" })).toHaveProperty("error");
    expect(parseResolveInput({ decision: "approve", amountTaka: 99999, note: "way too much" })).toHaveProperty("error");
    expect(parseResolveInput({ decision: "maybe" })).toHaveProperty("error");
  });
});

describe("parseAdjustInput", () => {
  it("needs a non-zero amount and a real reason", () => {
    expect(parseAdjustInput({ amountTaka: "25", note: "Eid bonus" })).toEqual({ amount: 2500, note: "Eid bonus" });
    expect(parseAdjustInput({ amountTaka: "-10.25", note: "Damaged parcel" })).toMatchObject({ amount: -1025 });
    expect(parseAdjustInput({ amountTaka: 0, note: "Eid bonus" })).toHaveProperty("error");
    expect(parseAdjustInput({ amountTaka: "", note: "Eid bonus" })).toHaveProperty("error");
    expect(parseAdjustInput({ amountTaka: 5, note: "hi" })).toHaveProperty("error");
    expect(parseAdjustInput({ amountTaka: 60000, note: "too big now" })).toHaveProperty("error");
  });
});

describe("messages the rider reads", () => {
  it("says what happened to their money", () => {
    expect(disputeDecisionMessage("approve", 4000, "ফি যোগ করা হলো").body).toBe("ওয়ালেটে ৳40 যোগ হয়েছে। ফি যোগ করা হলো");
    expect(disputeDecisionMessage("approve", -1500, "Penalty").body).toContain("৳15 কাটা হয়েছে");
    expect(disputeDecisionMessage("approve", 0, "").body).toBe("অফিস অভিযোগটি দেখেছে।");
    expect(disputeDecisionMessage("reject", 0, "Fee was paid").body).toContain("Fee was paid");
    expect(adjustmentMessage(2550, "Eid bonus")).toMatchObject({ title: "ওয়ালেটে টাকা যোগ হয়েছে", body: "+৳25.50 — Eid bonus" });
    expect(adjustmentMessage(-100, "Fix").body).toBe("−৳1 — Fix");
  });
  it("labels categories in both languages and falls back to the id", () => {
    expect(disputeCategoryLabel("missing_tip")).toBe("টিপ পাইনি");
    expect(disputeCategoryLabel("missing_tip", "en")).toBe("Tip missing");
    expect(disputeCategoryLabel("weird")).toBe("weird");
  });
});
