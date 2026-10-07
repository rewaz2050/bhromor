import { describe, expect, it } from "vitest";
import {
  MIN_FIT_REVIEWS,
  fitOptions,
  fitSummary,
  isFitKey,
  type FitKey,
} from "../review-fit";
import type { Review } from "../review-store";

const withFit = (...fits: (FitKey | null)[]): Review[] =>
  fits.map((fit, i) => ({
    id: `r${i}`,
    productId: "p1",
    rating: 4,
    author: "Buyer",
    body: "Fit note",
    date: 1,
    status: "approved",
    verified: true,
    ...(fit ? { fit } : {}),
  }));

describe("isFitKey", () => {
  it("accepts only the three answers, never a stray string", () => {
    expect(isFitKey("small")).toBe(true);
    expect(isFitKey("true")).toBe(true);
    expect(isFitKey("large")).toBe(true);
    expect(isFitKey("Small")).toBe(false);
    expect(isFitKey("")).toBe(false);
    expect(isFitKey(null)).toBe(false);
    expect(isFitKey(3)).toBe(false);
  });
});

describe("fitSummary", () => {
  it("says nothing until enough buyers have answered", () => {
    expect(fitSummary(withFit("true", "true"))).toBeNull();
    expect(fitSummary([])).toBeNull();
  });

  it("counts only approved reviews — a pending answer is an allegation", () => {
    const rows = withFit("true", "true", "true");
    rows[0].status = "pending";
    rows[1].status = "hidden";
    expect(fitSummary(rows)).toBeNull();
  });

  it("calls it true to size when most say so", () => {
    const s = fitSummary(withFit("true", "true", "true", "small", "large"))!;
    expect(s.total).toBe(5);
    expect(s.truePct).toBe(60);
    expect(s.verdict).toBe("true");
    expect(s.label).toContain("৬০%");
  });

  it("leans the way the answers lean when size is not reliable", () => {
    const s = fitSummary(withFit("small", "small", "large"))!;
    expect(s.verdict).toBe("small");
    expect(s.label).toContain("ছোট");
  });

  it("says mixed rather than inventing a verdict", () => {
    const s = fitSummary(withFit("small", "small", "large", "large"))!;
    expect(s.verdict).toBeNull();
    expect(s.label).toContain("মিশ্র");
  });

  it("ignores reviews where the buyer skipped the question", () => {
    const rows = withFit("true", "true", null, null, "true");
    expect(fitSummary(rows)!.total).toBe(MIN_FIT_REVIEWS);
  });

  it("writes English in English", () => {
    expect(fitSummary(withFit("small", "small", "small"), "en")!.label).toContain(
      "runs small",
    );
  });
});

describe("fitOptions", () => {
  it("offers three one-tap answers in both languages", () => {
    expect(fitOptions("bn").map((o) => o.label)).toEqual(["ছোট", "ঠিক ছিল", "বড়"]);
    expect(fitOptions("en").map((o) => o.key)).toEqual(["small", "true", "large"]);
  });
});
