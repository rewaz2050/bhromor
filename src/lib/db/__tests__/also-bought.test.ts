/**
 * UX plan §4 (R11) — "bought together with this": real baskets only,
 * cancelled orders ignored, ranked by distinct orders then units, memoised
 * per product for an hour, and never a thrown error on the product page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  items: [] as { order_id: string; product_id: string; qty: number }[],
  orders: [] as { id: string; status: string }[],
  reads: 0,
  fail: false,
}));

const fakeDb = (): SupabaseClient => {
  const from = (table: string) => {
    const f: Record<string, unknown> = {};
    let inIds: string[] | null = null;
    const chain: Record<string, unknown> = {};
    const resolve = () => {
      state.reads += 1;
      if (state.fail) return { data: null, error: { message: "boom" } };
      if (table === "order_items") {
        let rows = state.items;
        if (typeof f.product_id === "string") rows = rows.filter((r) => r.product_id === f.product_id);
        if (inIds) rows = rows.filter((r) => inIds!.includes(r.order_id));
        return { data: rows, error: null };
      }
      if (table === "orders") return { data: state.orders.filter((o) => (inIds ?? []).includes(o.id)), error: null };
      return { data: [], error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, v: unknown) => {
        f[col] = v;
        return chain;
      },
      in: (_col: string, ids: string[]) => {
        inIds = ids;
        return chain;
      },
      limit: () => chain,
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, err),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
};

beforeEach(async () => {
  const { __resetAlsoBought } = await import("@/lib/db/also-bought");
  __resetAlsoBought();
  state.reads = 0;
  state.fail = false;
  state.orders = [
    { id: "o1", status: "delivered" },
    { id: "o2", status: "confirmed" },
    { id: "o3", status: "cancelled" },
    { id: "o4", status: "delivered" },
  ];
  state.items = [
    { order_id: "o1", product_id: "p1", qty: 1 },
    { order_id: "o1", product_id: "p2", qty: 1 },
    { order_id: "o1", product_id: "p3", qty: 3 },
    { order_id: "o2", product_id: "p1", qty: 1 },
    { order_id: "o2", product_id: "p2", qty: 1 },
    { order_id: "o3", product_id: "p1", qty: 1 }, // cancelled — must not count
    { order_id: "o3", product_id: "p4", qty: 5 },
    { order_id: "o4", product_id: "p1", qty: 2 },
    { order_id: "o4", product_id: "p4", qty: 1 },
    { order_id: "o9", product_id: "p2", qty: 1 }, // p1 not in it — irrelevant
    { order_id: "o9", product_id: "p5", qty: 1 },
  ];
});

describe("alsoBought", () => {
  it("ranks co-purchased pieces by distinct live orders, then units", async () => {
    const { alsoBought } = await import("@/lib/db/also-bought");
    const out = await alsoBought(fakeDb(), "p1", 8, 1_000);
    expect(out.map((e) => e.productId)).toEqual(["p2", "p3", "p4"]);
    expect(out[0]).toEqual({ productId: "p2", orders: 2, units: 2 });
    // p3 (1 order, 3 units) beats p4 (1 live order, 1 unit — the cancelled 5 don't count)
    expect(out[1]).toEqual({ productId: "p3", orders: 1, units: 3 });
    expect(out[2]).toEqual({ productId: "p4", orders: 1, units: 1 });
  });

  it("memoises per product for an hour and honours the limit from cache", async () => {
    const { alsoBought, ALSO_BOUGHT_TTL_MS } = await import("@/lib/db/also-bought");
    const db = fakeDb();
    await alsoBought(db, "p1", 8, 1_000);
    const reads = state.reads;
    const again = await alsoBought(db, "p1", 1, 1_000 + 60_000);
    expect(state.reads).toBe(reads);
    expect(again).toHaveLength(1);
    await alsoBought(db, "p1", 8, 1_000 + ALSO_BOUGHT_TTL_MS + 1);
    expect(state.reads).toBeGreaterThan(reads);
  });

  it("answers nothing for a never-bought piece or a failing read", async () => {
    const { alsoBought } = await import("@/lib/db/also-bought");
    await expect(alsoBought(fakeDb(), "p-new", 8, 1_000)).resolves.toEqual([]);
    state.fail = true;
    await expect(alsoBought(fakeDb(), "p2", 8, 1_000)).resolves.toEqual([]);
  });
});
