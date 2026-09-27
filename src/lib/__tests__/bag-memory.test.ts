import { describe, expect, it } from "vitest";
import { BAG_BANNER_AFTER_MS, bagSignature, shouldShowBagBanner } from "../bag-memory";

describe("bag memory (UX plan §5, R10)", () => {
  const now = 1_000_000_000;
  it("shows only for a non-empty bag left alone for 30 minutes", () => {
    expect(shouldShowBagBanner({ itemCount: 2, touchedAt: now - BAG_BANNER_AFTER_MS, dismissedFor: null, signature: "a", now })).toBe(true);
    expect(shouldShowBagBanner({ itemCount: 2, touchedAt: now - BAG_BANNER_AFTER_MS + 1, dismissedFor: null, signature: "a", now })).toBe(false);
    expect(shouldShowBagBanner({ itemCount: 0, touchedAt: now - 2 * BAG_BANNER_AFTER_MS, dismissedFor: null, signature: "", now })).toBe(false);
    expect(shouldShowBagBanner({ itemCount: 2, touchedAt: null, dismissedFor: null, signature: "a", now })).toBe(false);
  });
  it("stays hidden for the exact bag that was dismissed, returns for a changed one", () => {
    const base = { itemCount: 2, touchedAt: now - BAG_BANNER_AFTER_MS, now };
    expect(shouldShowBagBanner({ ...base, dismissedFor: "a", signature: "a" })).toBe(false);
    expect(shouldShowBagBanner({ ...base, dismissedFor: "a", signature: "b" })).toBe(true);
  });
  it("fingerprints lines independent of order", () => {
    const a = bagSignature([{ productId: "p1", variantLabel: "M", qty: 1 }, { productId: "p2", variantLabel: "L", qty: 2 }]);
    const b = bagSignature([{ productId: "p2", variantLabel: "L", qty: 2 }, { productId: "p1", variantLabel: "M", qty: 1 }]);
    expect(a).toBe(b);
    expect(bagSignature([{ productId: "p1", variantLabel: "M", qty: 2 }])).not.toBe(bagSignature([{ productId: "p1", variantLabel: "M", qty: 1 }]));
  });
});
