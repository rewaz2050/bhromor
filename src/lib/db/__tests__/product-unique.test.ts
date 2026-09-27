/**
 * Marketplace-wide uniqueness, 2026-09-27.
 *
 * `products.slug` and `products.sku` are unique across EVERY shop (they come
 * from the single-shop schema), while a vendor's RLS client only sees its own
 * shop. Before this round the second shop's "Panjabi" died with "Slug or SKU
 * is already in use." for a name it had never used — and the shop could not
 * add the product at all. The create path now keeps the platform-wide
 * uniqueness and picks the next free spelling instead.
 *
 * The same round fixed the variant grid: retiring a sold-from size used to
 * leave its numbered SKU behind (product_variants.sku is unique too), so the
 * next size/colour change failed with a duplicate key.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createProduct, updateProduct } from "../admin";

type Row = Record<string, unknown>;
type Result = { data?: unknown; error?: unknown };

const CATEGORY = { id: "men" };

const productRow = (over: Row = {}): Row => ({
  id: "p1",
  shop_id: "shop-b",
  slug: "panjabi-2",
  name: "Panjabi",
  name_bn: "",
  sku: "PS-PANJABI",
  category_id: "men",
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
  created_at: "2026-09-27T00:00:00Z",
  ...over,
});

/**
 * Chainable fake. `productsInsert` decides what the Nth product insert
 * answers — the marketplace-wide constraint lives there, not in the RLS
 * probe (which returns nothing, exactly like a vendor's own catalog).
 */
const dbFor = (opts: {
  productInserts: (n: number, row: Row) => Result;
  variants?: Row[];
}) => {
  const seen = {
    productRows: [] as Row[],
    variantUpdates: [] as { row: Row; id?: string }[],
    variantInserts: [] as Row[],
  };
  let productInsertCount = 0;
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let payload: Row | undefined;
    let lastId: string | undefined;
    for (const m of ["select", "in", "neq", "order", "limit", "or", "delete"]) {
      q[m] = () => q;
    }
    q.eq = (col: string, val: string) => {
      if (col === "id") lastId = val;
      return q;
    };
    q.insert = (row: Row) => {
      payload = row;
      if (table === "products") {
        productInsertCount += 1;
        seen.productRows.push(row);
      }
      if (table === "product_variants") seen.variantInserts.push(row);
      return q;
    };
    q.update = (row: Row) => {
      payload = row;
      if (table === "product_variants") seen.variantUpdates.push({ row, id: undefined });
      return q;
    };
    const settle = (): Result => {
      if (table === "categories") return { data: [CATEGORY], error: null };
      if (table === "shops") return { data: { id: "shop-b" }, error: null };
      if (table === "products") {
        if (payload && payload.slug !== undefined) {
          return opts.productInserts(productInsertCount, payload);
        }
        return { data: productRow(), error: null };
      }
      if (table === "product_variants") {
        if (payload) {
          if (seen.variantUpdates.length > 0 && seen.variantUpdates.at(-1)?.id === undefined) {
            const last = seen.variantUpdates.at(-1)!;
            last.id = lastId;
          }
          return { data: null, error: null };
        }
        const id = lastId;
        const rows = opts.variants ?? [];
        return {
          data: id ? rows.filter((v) => v.product_id === id) : rows,
          error: null,
        };
      }
      return { data: null, error: null };
    };
    q.single = async () => settle();
    q.maybeSingle = async () => settle();
    q.then = (resolve: (v: Result) => unknown) => Promise.resolve(settle()).then(resolve);
    return q;
  };
  return { db: { from } as never, seen };
};

const DUPLICATE_SLUG = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "products_slug_key"',
};
const DUPLICATE_SKU = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "products_sku_key"',
};

const INPUT = {
  name: "Panjabi",
  slug: "panjabi",
  sku: "PS-PANJABI",
  category: "men",
  price: 150000,
  status: "published",
  media: [{ src: "https://x/y.jpg", alt: "" }],
};

describe("createProduct — another shop's slug/SKU", () => {
  it("retries with a free slug instead of refusing the shop", async () => {
    const { db, seen } = dbFor({
      productInserts: (n, row) =>
        n === 1 ? { data: null, error: DUPLICATE_SLUG } : { data: { id: "p1" }, error: null },
    });
    await createProduct(db, INPUT, "shop-b");
    expect(seen.productRows.map((r) => r.slug)).toEqual(["panjabi", "panjabi-2"]);
    // The SKU was never in the way, so it keeps the shop's own spelling.
    expect(seen.productRows.every((r) => r.sku === "PS-PANJABI")).toBe(true);
  });

  it("retries with a free SKU when that is what collided", async () => {
    const { db, seen } = dbFor({
      productInserts: (n) =>
        n === 1 ? { data: null, error: DUPLICATE_SKU } : { data: { id: "p1" }, error: null },
    });
    await createProduct(db, INPUT, "shop-b");
    expect(seen.productRows.map((r) => r.sku)).toEqual(["PS-PANJABI", "PS-PANJABI-2"]);
    expect(seen.productRows.every((r) => r.slug === "panjabi")).toBe(true);
  });

  it("keeps trying until the storefront URL is free", async () => {
    const { db, seen } = dbFor({
      productInserts: (n) =>
        n <= 3 ? { data: null, error: DUPLICATE_SLUG } : { data: { id: "p1" }, error: null },
    });
    await createProduct(db, INPUT, "shop-b");
    expect(seen.productRows.map((r) => r.slug)).toEqual([
      "panjabi",
      "panjabi-2",
      "panjabi-3",
      "panjabi-4",
    ]);
  });

  it("still fails honestly when every spelling is taken", async () => {
    const { db } = dbFor({ productInserts: () => ({ data: null, error: DUPLICATE_SLUG }) });
    await expect(createProduct(db, INPUT, "shop-b")).rejects.toMatchObject({ status: 409 });
  });
});

describe("updateProduct — variant SKU release", () => {
  const EXISTING = productRow({ id: "p1", slug: "tee", sku: "BT-A", price: 100000 });
  const SOLD_M_SIZE = {
    id: "v-m",
    product_id: "p1",
    color: "",
    size: "M",
    sku: "BT-A-V1",
    price: 100000,
    stock: 5,
    reserved: 2,
    available: 3,
    active: true,
  };

  it("frees a retired row's SKU so a new size can take that number", async () => {
    const { db, seen } = dbFor({
      productInserts: () => ({ data: { id: "p1" }, error: null }),
      variants: [SOLD_M_SIZE],
    });
    // The editor re-saves the grid with size L instead of M.
    await updateProduct(db, "p1", {
      colors: [""],
      sizes: ["L"],
      price: 100000,
      sku: "BT-A",
      name: "Tee",
    });
    // The row with reservations is deactivated AND its SKU released…
    expect(seen.variantUpdates[0].row).toMatchObject({ active: false, sku: null });
    expect(seen.variantUpdates[0].id).toBe("v-m");
    // …so the new size reuses the number instead of colliding with it.
    expect(seen.variantInserts.map((r) => r.sku)).toEqual(["BT-A-V1"]);
    expect(seen.variantInserts[0]).toMatchObject({ size: "L", product_id: "p1" });
  });

  it("skips numbers still held by rows that stay", async () => {
    const kept = { ...SOLD_M_SIZE, id: "v-l", size: "L", sku: "BT-A-V1", reserved: 0 };
    const { db, seen } = dbFor({
      productInserts: () => ({ data: { id: "p1" }, error: null }),
      variants: [kept],
    });
    await updateProduct(db, "p1", {
      colors: [""],
      sizes: ["L", "XL"],
      price: 100000,
      sku: "BT-A",
      name: "Tee",
    });
    expect(seen.variantInserts.map((r) => r.sku)).toEqual(["BT-A-V2"]);
  });
});
