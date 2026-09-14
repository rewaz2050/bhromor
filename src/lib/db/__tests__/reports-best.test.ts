/**
 * P2 #4 — the server-side best-seller list. It must mirror v_product_sales
 * exactly: non-cancelled orders count, refunded returns subtract, in-flight
 * returns do not, and the 100-row client queue can never cap it.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { bestSellers } from "../reports";

const state = vi.hoisted(() => ({
  viewRows: [] as { product_id: string; units_sold: number }[],
  productRows: [] as { id: string; name: string; slug: string }[],
  itemRows: [] as Record<string, unknown>[],
  viewError: null as { message: string } | null,
  productsError: null as { message: string } | null,
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.in = () => obj;
  obj.order = () => obj;
  obj.limit = () => obj;
  return obj;
};

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

const fakeDb = (): SupabaseClient => ({
  from: (table: string) => {
    switch (table) {
      case "v_product_sales":
        return {
          select: () =>
            chain(state.viewError ? null : state.viewRows, state.viewError),
        };
      case "products":
        return {
          select: () =>
            chain(
              state.productsError ? null : state.productRows,
              state.productsError,
            ),
        };
      case "order_items":
        return { select: () => chain(state.itemRows) };
      default:
        return { select: () => chain([]) };
    }
  },
} as unknown as SupabaseClient);

const order = (
  id: string,
  over: Partial<{
    status: string;
    is_return: boolean | null;
    return_parent_id: string | null;
    return_status: string | null;
    ageDays: number;
  }> = {},
) => ({
  id,
  status: over.status ?? "delivered",
  is_return: over.is_return ?? false,
  return_parent_id: over.return_parent_id ?? null,
  return_status: over.return_status ?? null,
  created_at: daysAgo(over.ageDays ?? 1),
});

const line = (
  productId: string,
  qty: number,
  unitPrice: number,
  o: ReturnType<typeof order>,
) => ({ product_id: productId, qty, unit_price: unitPrice, orders: o });

describe("bestSellers (P2 #4)", () => {
  it("ranks by the view, joins names, and computes revenue + 30-day units", async () => {
    state.viewRows = [
      { product_id: "p1", units_sold: 5 },
      { product_id: "p2", units_sold: 2 },
      { product_id: "p3", units_sold: 2 },
    ];
    state.productRows = [
      { id: "p1", name: "Black Panjabi", slug: "black-panjabi" },
      { id: "p2", name: "Red Gamcha", slug: "red-gamcha" },
      { id: "p3", name: "Blue Kurta", slug: "blue-kurta" },
    ];
    state.itemRows = [
      // p1: 3 in the last 30 days + 2 before → both count all-time.
      line("p1", 3, 100_000, order("A", { ageDays: 5 })),
      line("p1", 2, 100_000, order("B", { status: "pending", ageDays: 40 })),
      // p2: 3 sold, 1 returned + refunded → the view says 2.
      line("p2", 3, 50_000, order("C", { ageDays: 10 })),
      line(
        "p2",
        1,
        0,
        order("D", {
          is_return: true,
          return_parent_id: "C",
          return_status: "refunded",
          ageDays: 9,
        }),
      ),
      // p3: 2 sold, 1 return still IN FLIGHT → the view says 2 (it stands).
      line("p3", 2, 20_000, order("E", { ageDays: 3 })),
      line(
        "p3",
        1,
        0,
        order("F", {
          is_return: true,
          return_parent_id: "E",
          return_status: "requested",
          ageDays: 2,
        }),
      ),
      // Cancelled orders never count — not in the view, not here.
      line("p3", 1, 20_000, order("G", { status: "cancelled", ageDays: 1 })),
    ];

    const rows = await bestSellers(fakeDb());
    expect(rows.map((r) => r.productId)).toEqual(["p1", "p2", "p3"]);

    const p1 = rows[0];
    expect(p1.name).toBe("Black Panjabi");
    expect(p1.units).toBe(5);
    expect(p1.last30Units).toBe(3);
    expect(p1.orderCount).toBe(2);
    expect(p1.revenue).toBe(500_000);

    const p2 = rows[1];
    expect(p2.units).toBe(2); // the view's figure, not the raw 3
    expect(p2.last30Units).toBe(2); // refunded return subtracts
    expect(p2.orderCount).toBe(1); // the return order is not a customer order
    expect(p2.revenue).toBe(150_000);

    const p3 = rows[2];
    expect(p3.units).toBe(2);
    expect(p3.last30Units).toBe(2); // in-flight return does NOT subtract yet
    expect(p3.revenue).toBe(40_000); // cancelled order excluded
    expect(p3.orderCount).toBe(1);
  });

  it("is empty before the first eligible sale — never a seed", async () => {
    state.viewRows = [];
    state.productRows = [];
    state.itemRows = [];
    expect(await bestSellers(fakeDb())).toEqual([]);
  });

  it("a broken read is an empty list, not a 500", async () => {
    state.viewError = { message: "boom" };
    expect(await bestSellers(fakeDb())).toEqual([]);
    state.viewError = null;
    state.productsError = { message: "boom" };
    state.viewRows = [{ product_id: "p1", units_sold: 1 }];
    expect(await bestSellers(fakeDb())).toEqual([]);
    state.productsError = null;
  });
});
