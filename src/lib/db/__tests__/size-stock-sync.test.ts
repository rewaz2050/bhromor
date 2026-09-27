/**
 * UX plan §4 (R10) — per-size stock on the seller side:
 *   - `spreadAvailable` moves the fewest rows and never dips below reserved;
 *   - an unchanged grid + `sizeStock` nudges only the named sizes;
 *   - an unchanged grid + total re-saved with sold units does NOT shave the
 *     sold units off again (the old drift bug);
 *   - a fresh grid splits each size's count over its colours.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { spreadAvailable, updateProduct } from "../admin";

afterEach(() => vi.restoreAllMocks());

const PRODUCT = {
  id: "p1",
  shop_id: "shop-1",
  name: "Panjabi",
  name_bn: "",
  sku: "PJ-1",
  slug: "panjabi",
  category_id: "c1",
  subcategory: "",
  short_description: "",
  description: "",
  details: [],
  price: 150000,
  compare_at_price: null,
  status: "published",
  active: true,
  featured: false,
  is_new: false,
  in_stock: true,
  low_stock: false,
  created_at: "2026-09-01T00:00:00Z",
};

const variant = (o: Partial<Record<string, unknown>>) => ({
  id: "v",
  product_id: "p1",
  color: "",
  size: "",
  sku: "PJ-1-V1",
  price: 150000,
  stock: 0,
  reserved: 0,
  available: 0,
  active: true,
  ...o,
});

/** Chainable double that records variant writes with their `eq("id", …)`. */
const dbFor = (variants: Record<string, unknown>[]) => {
  const writes: { op: string; row: Record<string, unknown>; id?: string }[] = [];
  const tables: Record<string, unknown[]> = {
    products: [PRODUCT],
    categories: [{ id: "c1" }],
    product_variants: variants,
    product_media: [],
  };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let pending: { op: string; row: Record<string, unknown> } | null = null;
    for (const m of ["select", "in", "neq", "order", "limit", "delete", "upsert"]) {
      q[m] = () => q;
    }
    q.eq = (col: string, val: string) => {
      if (table === "product_variants" && pending && col === "id") {
        writes.push({ ...pending, id: val });
        pending = null;
      }
      return q;
    };
    q.update = (row: Record<string, unknown>) => {
      if (table === "product_variants") pending = { op: "update", row };
      return q;
    };
    q.insert = (row: Record<string, unknown>) => {
      if (table === "product_variants") writes.push({ op: "insert", row });
      return q;
    };
    q.single = async () => ({ data: tables[table][0] ?? null, error: null });
    q.maybeSingle = async () => ({ data: tables[table][0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
    return q;
  };
  return { db: { from } as never, writes };
};

describe("spreadAvailable", () => {
  it("adds to the first row, takes from the last rows, never below reserved", () => {
    const rows = [
      { id: "a", stock: 5, reserved: 2 }, // 3 available
      { id: "b", stock: 4, reserved: 0 }, // 4 available
    ];
    expect(spreadAvailable(rows, 10)).toEqual([{ id: "a", stock: 8 }]);
    expect(spreadAvailable(rows, 7)).toEqual([]);
    expect(spreadAvailable(rows, 5)).toEqual([{ id: "b", stock: 2 }]);
    expect(spreadAvailable(rows, 0)).toEqual([
      { id: "a", stock: 2 },
      { id: "b", stock: 0 },
    ]);
  });
});

describe("syncVariants via updateProduct — per-size stock", () => {
  const grid = [
    variant({ id: "gm", color: "Green", size: "M", stock: 4, reserved: 1, available: 3 }),
    variant({ id: "gl", color: "Green", size: "L", stock: 2, reserved: 0, available: 2 }),
    variant({ id: "bm", color: "Blue", size: "M", stock: 3, reserved: 0, available: 3 }),
    variant({ id: "bl", color: "Blue", size: "L", stock: 0, reserved: 0, available: 0 }),
  ];

  it("nudges only the named sizes on an unchanged grid", async () => {
    const { db, writes } = dbFor(grid);
    await updateProduct(db, "p1", {
      colors: ["Green", "Blue"],
      sizes: ["M", "L"],
      sizeStock: { L: 6 }, // M untouched (6 available today)
    });
    const stockWrites = writes.filter((w) => w.op === "update" && "stock" in w.row);
    // L: Blue (first by colour) gets the 4 extra → stock 4; Green L keeps 2.
    expect(stockWrites).toEqual([{ op: "update", row: expect.objectContaining({ stock: 4 }), id: "bl" }]);
  });

  it("a shortfall comes off the last colour first and never below reserved", async () => {
    const { db, writes } = dbFor(grid);
    await updateProduct(db, "p1", { colors: ["Green", "Blue"], sizes: ["M", "L"], sizeStock: { M: 1 } });
    const stockWrites = writes.filter((w) => w.op === "update" && "stock" in w.row);
    // M rows sorted by colour: Blue (3 avail), Green (3 avail, 1 reserved).
    // Want 1 → take 3 from Green (stock → 1 = reserved) then 2 from Blue (→ 1).
    expect(stockWrites.map((w) => [w.id, w.row.stock])).toEqual([
      ["bm", 1],
      ["gm", 1],
    ]);
  });

  it("re-saving the total does not shave off the units already sold", async () => {
    const { db, writes } = dbFor(grid);
    // The editor shows 8 (= available) and sends 8 back unchanged.
    await updateProduct(db, "p1", { colors: ["Green", "Blue"], sizes: ["M", "L"], stock: 8 });
    expect(writes.filter((w) => w.op === "update" && "stock" in w.row)).toEqual([]);
  });

  it("a fresh grid splits each size's count over its colours", async () => {
    const { db, writes } = dbFor([]);
    await updateProduct(db, "p1", {
      colors: ["Green", "Blue"],
      sizes: ["M", "L"],
      sizeStock: { M: 5, L: 0 },
      stock: 5,
    });
    const inserts = writes.filter((w) => w.op === "insert").map((w) => [w.row.color, w.row.size, w.row.stock]);
    expect(inserts).toEqual([
      ["Green", "M", 3],
      ["Green", "L", 0],
      ["Blue", "M", 2],
      ["Blue", "L", 0],
    ]);
  });

  it("drops sizes that are not in the grid", async () => {
    const { db, writes } = dbFor(grid);
    await updateProduct(db, "p1", { colors: ["Green", "Blue"], sizes: ["M", "L"], sizeStock: { XXL: 9, M: "6" } });
    expect(writes.filter((w) => w.op === "update" && "stock" in w.row)).toEqual([]);
  });
});
