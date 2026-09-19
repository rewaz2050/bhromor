/**
 * Ops batch I (2026-09-18) — catalog server rules:
 *   - a one-field product PATCH (Publish / Archive / Feature) keeps the
 *     stored price instead of failing "Price must be 0 or more";
 *   - the vendor product list is three batched reads, not three per row.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { updateProduct } from "../admin";
import { listVendorProducts } from "../vendor";

afterEach(() => vi.restoreAllMocks());

/** Chainable query double: filters return itself, terminals resolve `rows`. */
const query = (
  rows: unknown[],
  log?: { table: string; calls: { op: string; args: unknown[] }[] },
) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "neq", "order", "limit", "update", "delete", "insert", "upsert"]) {
    q[m] = (...args: unknown[]) => {
      log?.calls.push({ op: m, args });
      return q;
    };
  }
  q.single = async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "0 rows" } });
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return q;
};

const PRODUCT = {
  id: "p1",
  shop_id: "shop-1",
  name: "Jamdani",
  name_bn: "",
  sku: "JS-1",
  slug: "jamdani",
  category_id: "c1",
  subcategory: "",
  short_description: "",
  description: "",
  details: [],
  price: 250000,
  compare_at_price: 300000,
  status: "draft",
  active: true,
  featured: false,
  is_new: false,
  in_stock: true,
  low_stock: false,
  created_at: "2026-09-01T00:00:00Z",
};

describe("updateProduct — partial PATCH", () => {
  const dbFor = () => {
    const writes: Record<string, unknown>[] = [];
    const tables: Record<string, unknown[]> = {
      products: [PRODUCT],
      categories: [{ id: "c1" }],
      product_variants: [],
      product_media: [],
    };
    const db = {
      from: (table: string) => {
        const q = query(tables[table] ?? []);
        if (table === "products") {
          const update = q.update as (...a: unknown[]) => unknown;
          q.update = (patch: Record<string, unknown>) => {
            writes.push(patch);
            return update(patch);
          };
        }
        return q;
      },
    } as never;
    return { db, writes };
  };

  it("{ status: 'published' } keeps price, compare-at and everything else", async () => {
    const { db, writes } = dbFor();
    await updateProduct(db, "p1", { status: "published" });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      status: "published",
      price: 250000,
      active: true,
      name: "Jamdani",
      sku: "JS-1",
      category_id: "c1",
    });
    // compare-at is untouched (not in the body → not in the patch), and the
    // validator saw the stored pair (300000 > 250000) rather than -1.
    expect("compare_at_price" in writes[0]).toBe(false);
  });

  it("{ active: false } / { featured: true } are accepted the same way", async () => {
    const a = dbFor();
    await updateProduct(a.db, "p1", { active: false });
    expect(a.writes[0]).toMatchObject({ active: false, price: 250000, status: "draft" });
    const b = dbFor();
    await updateProduct(b.db, "p1", { featured: true });
    expect(b.writes[0]).toMatchObject({ featured: true, price: 250000 });
  });

  it("an explicit bad price is still refused; an unknown status cannot reach the column", async () => {
    const { db, writes } = dbFor();
    await expect(updateProduct(db, "p1", { price: -5 })).rejects.toMatchObject({ status: 400 });
    expect(writes).toHaveLength(0);
    const w = dbFor();
    await updateProduct(w.db, "p1", { status: "banana" });
    expect(w.writes[0].status).toBe("draft"); // sanitised, not "banana"
  });

  it("a full editor body still writes the new price", async () => {
    const { db, writes } = dbFor();
    await updateProduct(db, "p1", { price: 199900, compareAtPrice: null });
    expect(writes[0]).toMatchObject({ price: 199900, compare_at_price: null });
  });
});

describe("listVendorProducts — batched reads", () => {
  it("reads products once, then variants + media with a single IN each", async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = [];
    const tables: Record<string, unknown[]> = {
      products: [PRODUCT, { ...PRODUCT, id: "p2", sku: "JS-2", slug: "j2" }],
      product_variants: [
        { id: "v1", product_id: "p1", color: "", size: "", sku: "JS-1-V1", price: 250000, stock: 3, reserved: 0, available: 3, active: true },
        { id: "v2", product_id: "p2", color: "", size: "", sku: "JS-2-V1", price: 250000, stock: 0, reserved: 0, available: 0, active: true },
      ],
      product_media: [
        { id: "m1", product_id: "p2", type: "image", url: "/images/x.jpg", public_id: null, alt_text: "", sort_order: 0, metadata: {} },
      ],
    };
    const service = {
      from: (table: string) => {
        const log = { table, calls: [] as { op: string; args: unknown[] }[] };
        const q = query(tables[table] ?? [], log);
        // flush the per-query log into the shared list lazily
        const then = q.then as (r: (v: unknown) => unknown) => Promise<unknown>;
        q.then = (resolve: (v: unknown) => unknown) => {
          calls.push(...log.calls.map((c) => ({ table, ...c })));
          return then(resolve);
        };
        return q;
      },
    } as never;

    const out = await listVendorProducts(service, "shop-1");
    expect(out.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(out[0].stock).toBe(3);
    expect(out[1].stock).toBe(0);
    expect(out[1].media[0]?.src).toBe("/images/x.jpg");

    const tablesRead = calls.filter((c) => c.op === "select").map((c) => c.table);
    expect(tablesRead.sort()).toEqual(["product_media", "product_variants", "products"]);
    const ins = calls.filter((c) => c.op === "in");
    expect(ins).toHaveLength(2);
    for (const c of ins) expect(c.args).toEqual(["product_id", ["p1", "p2"]]);
    expect(calls.find((c) => c.table === "products" && c.op === "eq")?.args).toEqual(["shop_id", "shop-1"]);
  });

  it("returns [] without touching variants/media when the shop has no products", async () => {
    const seen: string[] = [];
    const service = {
      from: (table: string) => {
        seen.push(table);
        return query([]);
      },
    } as never;
    expect(await listVendorProducts(service, "shop-1")).toEqual([]);
    expect(seen).toEqual(["products"]);
  });
});
