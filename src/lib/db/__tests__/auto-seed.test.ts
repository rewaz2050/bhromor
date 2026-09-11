/**
 * Auto-seed safety contract:
 * - writes the launch catalog ONLY into a products table with zero rows
 * - never touches an existing catalog (even all-draft ones — admin intent)
 * - stops on the first DB rejection (the route then answers an honest 503)
 * - bridges legacy launch-seed ids (p1…) to seeded rows by slug for remapping
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PRODUCTS } from "@/lib/catalog";
import { ensureLaunchCatalog, remapSeedItemIds } from "../auto-seed";

type Write = { table: string; op: string; rows: unknown };

const makeFakeDb = (opts: {
  productCount: number;
  failOn?: (table: string, op: string) => boolean;
}) => {
  const writes: Write[] = [];
  const errOf = (table: string, op: string) =>
    opts.failOn?.(table, op)
      ? Promise.resolve({ error: { message: `boom ${table}.${op}` } })
      : Promise.resolve({ error: null });

  const chain = (table: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {
      eq: () => c,
      select: (_cols?: string, o?: { head?: boolean }) =>
        o?.head ? Promise.resolve({ count: opts.productCount, error: null }) : c,
      maybeSingle: () =>
        Promise.resolve(
          table === "shops" ? { data: { id: "shop-1" }, error: null } : { data: null, error: null },
        ),
      in: () =>
        Promise.resolve(
          table === "products"
            ? { data: PRODUCTS.map((p, i) => ({ id: `u-${i + 1}`, slug: p.slug })), error: null }
            : { data: [], error: null },
        ),
      upsert: (rows: unknown) => {
        writes.push({ table, op: "upsert", rows });
        return errOf(table, "upsert");
      },
      insert: (rows: unknown) => {
        writes.push({ table, op: "insert", rows });
        return errOf(table, "insert");
      },
      delete: () => {
        writes.push({ table, op: "delete", rows: null });
        return c;
      },
    };
    return c;
  };

  return {
    writes,
    from: (table: string) => chain(table) as never,
  };
};

describe("ensureLaunchCatalog — the empty-catalog guard", () => {
  it("seeds the full launch shape into an EMPTY products table", async () => {
    const db = makeFakeDb({ productCount: 0 });
    await expect(ensureLaunchCatalog(db as never)).resolves.toBe(true);

    const tables = db.writes.map((w) => `${w.table}:${w.op}`);
    for (const t of [
      "shops:upsert",
      "categories:upsert",
      "delivery_zones:upsert",
      "coupons:upsert",
      "site_settings:upsert",
      "products:upsert",
      "product_variants:upsert",
      "product_media:delete",
      "product_media:insert",
    ]) {
      expect(tables, `missing write ${t}`).toContain(t);
    }

    const productsWrite = db.writes.find((w) => w.table === "products" && w.op === "upsert");
    const rows = productsWrite?.rows as Record<string, unknown>[];
    expect(rows).toHaveLength(PRODUCTS.length);
    expect(rows.map((r) => r.slug)).toEqual(PRODUCTS.map((p) => p.slug));
    expect(rows.map((r) => r.price)).toEqual(PRODUCTS.map((p) => p.price)); // paisa parity
    expect(rows.every((r) => r.status === "published" && r.active === true)).toBe(true);
    // Child rows point at the shop owner's store, not the seed shop id.
    expect(rows.every((r) => r.shop_id === "shop-1")).toBe(true);
  });

  it("REFUSES to write when the products table holds rows (even all-draft)", async () => {
    const db = makeFakeDb({ productCount: 5 });
    await expect(ensureLaunchCatalog(db as never)).resolves.toBe(false);
    // A republish-on-conflict would resurrect archived rows — zero writes allowed.
    expect(db.writes).toHaveLength(0);
  });

  it("stops at the first rejection instead of half-seeding blindly past it", async () => {
    const db = makeFakeDb({ productCount: 0, failOn: (t) => t === "coupons" });
    await expect(ensureLaunchCatalog(db as never)).resolves.toBe(false);
    const tables = db.writes.map((w) => w.table);
    expect(tables).toContain("categories"); // before coupons
    expect(tables).not.toContain("products"); // and not after
  });

  it("a count-query failure (missing table) reads as 'no seeding possible'", async () => {
    const db = {
      from: () => ({
        select: () => Promise.resolve({ count: null, error: { code: "42P01" } }),
      }),
    };
    await expect(ensureLaunchCatalog(db as never)).resolves.toBe(false);
  });
});

describe("remapSeedItemIds — the launch-cart bridge", () => {
  const live = PRODUCTS.map((p, i) => ({ id: `u-${i + 1}`, slug: p.slug }));

  it("rewrites seed ids to live rows by slug, leaves live/unknown ids alone", () => {
    const out = remapSeedItemIds(
      [
        { productId: PRODUCTS[0].id }, // p1 → seeded row
        { productId: "u-3" }, // already live
        { productId: "custom-42" }, // admin-only product — untouched
      ],
      live,
    );
    expect(out[0].productId).toBe("u-1");
    expect(out[1].productId).toBe("u-3");
    expect(out[2].productId).toBe("custom-42");
  });

  it("returns the SAME array identity when nothing maps (no copy churn)", () => {
    const items = [{ productId: "u-1" }];
    expect(remapSeedItemIds(items, live)).toBe(items);
  });
});
