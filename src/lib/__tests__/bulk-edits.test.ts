/**
 * A4 — bulk price & stock planning (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 * The plan is the contract: what is saved, what is skipped and why, and that
 * a percent cut can never make an item free.
 */
import { describe, expect, it } from "vitest";
import { planBulkEdit, summaryLines, MIN_PRICE_PAISA } from "../bulk-edits";
import { PRODUCTS, type Product } from "../catalog";
import { LOW_STOCK_AT } from "../product-shelf";

const product = (over: Partial<Product> = {}): Product => ({
  ...PRODUCTS[0],
  id: "p1",
  name: "Panjabi",
  price: 120_000, // ৳1,200
  stock: 12,
  inStock: true,
  ...over,
});

describe("planBulkEdit — price", () => {
  it("cuts a percentage and shows the before → after line", () => {
    const plan = planBulkEdit([product()], { price: { kind: "percent", percent: -10 } });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].price).toBe(108_000);
    expect(summaryLines(plan.summary[0])).toBe("৳1,200 → ৳1,080");
    expect(plan.unchanged).toBe(0);
  });

  it("never lets a cut make an item free — ৳1 is the floor", () => {
    const plan = planBulkEdit([product({ price: 150 })], {
      price: { kind: "percent", percent: -90 },
    });
    expect(plan.changes[0].price).toBe(MIN_PRICE_PAISA);
  });

  it("sets a fixed price in taka", () => {
    const plan = planBulkEdit([product()], { price: { kind: "set", taka: 999 } });
    expect(plan.changes[0].price).toBe(99_900);
    expect(summaryLines(plan.summary[0])).toBe("৳1,200 → ৳999");
  });

  it("does not 'save' a row that already has the target price", () => {
    const plan = planBulkEdit([product({ price: 99_900 })], { price: { kind: "set", taka: 999 } });
    expect(plan.changes).toHaveLength(0);
    expect(plan.summary).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });
});

describe("planBulkEdit — stock", () => {
  it("sets a total and recomputes in-stock / low-stock honestly", () => {
    const plan = planBulkEdit([product()], { stock: { kind: "total", value: 3 } });
    const row = plan.changes[0];
    expect(row.stock).toBe(3);
    expect(row.inStock).toBe(true);
    expect(row.lowStock).toBe(true);
    expect(summaryLines(plan.summary[0])).toBe("12 → 3 in stock");

    const big = planBulkEdit([product()], { stock: { kind: "total", value: LOW_STOCK_AT + 20 } });
    expect(big.changes[0].lowStock).toBe(false);
  });

  it("skips a per-size row when asked for a TOTAL and says why", () => {
    const sized = product({ id: "sized", name: "Sized panjabi", sizeStock: { M: 2, L: 0 } });
    const plan = planBulkEdit([sized], { stock: { kind: "total", value: 10 } });
    expect(plan.changes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toMatch(/per-size/i);
  });

  it("'each size' fills the grid and sets the matching total", () => {
    const sized = product({ id: "sized", sizeStock: { M: 2, L: 0, XL: 1 } });
    const plan = planBulkEdit([sized], { stock: { kind: "perSize", value: 5 } });
    const row = plan.changes[0];
    expect(row.sizeStock).toEqual({ M: 5, L: 5, XL: 5 });
    expect(row.stock).toBe(15);
    expect(row.inStock).toBe(true);
    expect(summaryLines(plan.summary[0])).toBe("3 → 5 per size (15 total)");
  });

  it("'each size' on a row without a grid behaves as a total (no invented grid)", () => {
    const plan = planBulkEdit([product({ sizeStock: undefined })], {
      stock: { kind: "perSize", value: 4 },
    });
    expect(plan.changes[0].stock).toBe(4);
    expect(plan.changes[0].sizeStock).toBeUndefined();
  });

  it("'sold out' zeroes the shelf AND every size, so checkout really stops", () => {
    const sized = product({ sizeStock: { M: 2, L: 1 } });
    const plan = planBulkEdit([sized], { stock: { kind: "soldOut" } });
    const row = plan.changes[0];
    expect(row.stock).toBe(0);
    expect(row.inStock).toBe(false);
    expect(row.lowStock).toBe(false);
    expect(row.sizeStock).toEqual({ M: 0, L: 0 });
  });

  it("applies price and stock in one pass and keeps the original rows untouched", () => {
    const rows = [product(), product({ id: "p2", name: "Shirt", price: 80_000, stock: 0, inStock: false })];
    const plan = planBulkEdit(rows, {
      price: { kind: "percent", percent: -5 },
      stock: { kind: "total", value: 8 },
    });
    expect(plan.changes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(plan.changes[0].price).toBe(114_000);
    expect(plan.changes[1].stock).toBe(8);
    expect(plan.changes[1].inStock).toBe(true);
    // The caller's array is never mutated — the plan is the only output.
    expect(rows[0].price).toBe(120_000);
    expect(rows[1].stock).toBe(0);
  });
});
