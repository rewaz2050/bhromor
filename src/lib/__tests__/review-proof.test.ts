/**
 * Review proof (UX plan §4/§7, R10) — the track page stashes "this order,
 * this phone, these pieces" so the product page's review form can send it
 * along; the server re-checks it. Stale or another piece → nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetReviewProof,
  REVIEW_PROOF_KEY,
  readReviewProof,
  saveReviewProof,
} from "@/lib/review-proof";

afterEach(() => __resetReviewProof());

describe("review proof handoff", () => {
  it("round-trips for a piece in the order and hides the rest", () => {
    saveReviewProof({ orderId: "PS-20260927-0001", phone: "01711111111", productIds: ["p1", "p2"] });
    expect(readReviewProof("p1")).toEqual({ orderId: "PS-20260927-0001", phone: "01711111111" });
    expect(readReviewProof("p2")).toEqual({ orderId: "PS-20260927-0001", phone: "01711111111" });
    expect(readReviewProof("p9")).toBeNull();
  });

  it("expires after an hour and survives garbage", () => {
    saveReviewProof({ orderId: "PS-1", phone: "01711111111", productIds: ["p1"] });
    expect(readReviewProof("p1", Date.now() + 61 * 60 * 1000)).toBeNull();
    window.sessionStorage.setItem(REVIEW_PROOF_KEY, "{not json");
    expect(readReviewProof("p1")).toBeNull();
    window.sessionStorage.setItem(REVIEW_PROOF_KEY, JSON.stringify({ orderId: 1, productIds: "p1" }));
    expect(readReviewProof("p1")).toBeNull();
  });

  it("reads nothing when nothing was saved", () => {
    expect(readReviewProof("p1")).toBeNull();
  });
});
