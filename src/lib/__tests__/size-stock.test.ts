import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product } from "@/lib/catalog";
import { availableSizes, isSizeSoldOut, pickSelectableSize, sizeAvailability, sizeLeftLabel } from "../size-stock";

const base = PRODUCTS.find((p) => p.sizes.length >= 3)!;
const withGrid = (sizeStock: Record<string, number>): Product => ({ ...base, sizeStock });

describe("per-size stock helpers (UX plan §4, R10)", () => {
  it("treats a product without a grid as fully available — never sold out on a guess", () => {
    for (const s of base.sizes) {
      expect(sizeAvailability(base, s)).toEqual({ state: "unknown", available: null });
      expect(isSizeSoldOut(base, s)).toBe(false);
    }
    expect(availableSizes(base)).toEqual(base.sizes);
  });

  it("bands each size: out / low (≤3) / ok, and a size missing from the grid stays unknown", () => {
    const [a, b, c] = base.sizes;
    const p = withGrid({ [a]: 0, [b]: 2, [c]: 9 });
    expect(sizeAvailability(p, a)).toEqual({ state: "out", available: 0 });
    expect(sizeAvailability(p, b)).toEqual({ state: "low", available: 2 });
    expect(sizeAvailability(p, c)).toEqual({ state: "ok", available: 9 });
    expect(sizeAvailability(p, "ZZZ").state).toBe("unknown");
    expect(availableSizes(p)).not.toContain(a);
  });

  it("pre-selects only a size that can be bought", () => {
    const [a, b] = base.sizes;
    const p = withGrid({ [a]: 0, [b]: 4 });
    expect(pickSelectableSize(p, a)).toBe("");
    expect(pickSelectableSize(p, b)).toBe(b);
    expect(pickSelectableSize(p, null)).toBe("");
    const single: Product = { ...base, sizes: [a], sizeStock: { [a]: 1 } };
    expect(pickSelectableSize(single, null)).toBe(a);
    const singleOut: Product = { ...base, sizes: [a], sizeStock: { [a]: 0 } };
    expect(pickSelectableSize(singleOut, null)).toBe("");
  });

  it("whispers the count in the shopper's digits", () => {
    expect(sizeLeftLabel(2, "bn")).toBe("২টি বাকি");
    expect(sizeLeftLabel(2, "en")).toBe("2 left");
  });
});
