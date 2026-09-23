import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { planReorder, variantStillOffered } from "@/lib/reorder";

const p1 = PRODUCTS[0]; // Forest Green · M/L/XL/XXL

describe("planReorder", () => {
  it("re-adds exactly what was bought when it is still offered", () => {
    const plan = planReorder(
      [{ productId: p1.id, variantLabel: "Forest Green · L", qty: 2, name: p1.name }],
      PRODUCTS,
    );
    expect(plan.add).toEqual([{ product: p1, variantLabel: "Forest Green · L", qty: 2 }]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips — never substitutes — pieces that are gone, sold out or lost that size", () => {
    const soldOut = { ...PRODUCTS[1], inStock: false };
    const plan = planReorder(
      [
        { productId: "ghost", variantLabel: "Red · M", qty: 1, name: "Old Kurta" },
        { productId: soldOut.id, variantLabel: `${soldOut.colors[0]} · M`, qty: 1 },
        { productId: p1.id, variantLabel: "Forest Green · XS", qty: 1 },
        { productId: p1.id, variantLabel: "Forest Green · M", qty: 99 },
      ],
      [p1, soldOut],
    );
    expect(plan.skipped).toEqual([
      { name: "Old Kurta", reason: "gone" },
      { name: soldOut.name, reason: "out-of-stock" },
      { name: p1.name, reason: "variant" },
    ]);
    // quantity clamps to the cart's per-line maximum
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0].qty).toBeLessThan(99);
  });

  it("accepts the label shapes the cart writes", () => {
    expect(variantStillOffered(p1, "Forest Green · XL")).toBe(true);
    expect(variantStillOffered(p1, "Forest Green")).toBe(true);
    expect(variantStillOffered(p1, "Default")).toBe(false);
    expect(variantStillOffered({ ...p1, colors: [], sizes: [] }, "Default")).toBe(true);
    expect(variantStillOffered(p1, "")).toBe(false);
  });
});
