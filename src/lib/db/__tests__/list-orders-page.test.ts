/**
 * Staff order list pagination (audit M5, 2026-09-16).
 *
 * `listOrders` used to be a flat 200-row cap: once a shop passed 200 orders
 * the older ones were simply unreachable from the admin, and every call
 * loaded the whole `coupons` and `delivery_zones` tables. It now returns one
 * keyset page (newest first) plus an opaque `nextCursor`, and looks up only
 * the zones/coupons the page references.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  AdminInputError,
  decodeOrderCursor,
  encodeOrderCursor,
  listOrders,
} from "../admin";

type Call = { table: string; filters: string[]; limit?: number };

const state = vi.hoisted(() => ({
  orders: [] as Record<string, unknown>[],
  calls: [] as Call[],
}));

const orderRow = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  shop_id: "shop",
  order_no: `PS-20260916-${String(n).padStart(4, "0")}`,
  customer_id: null,
  customer_name: `Customer ${n}`,
  customer_phone: "01712345678",
  area: "Kandirpar",
  address: "House 1",
  note: "",
  rider_id: null,
  delivery_code: null,
  zone_id: n % 2 === 0 ? "zone-even" : "zone-odd",
  subtotal: 1000,
  delivery_charge: 60,
  discount: n === 3 ? 100 : 0,
  coupon_id: n === 3 ? "coupon-3" : null,
  total: n === 3 ? 960 : 1060,
  payment: "cod",
  status: "pending",
  created_at: `2026-09-16T10:00:${String(n % 60).padStart(2, "0")}.000Z`,
  updated_at: `2026-09-16T10:00:${String(n % 60).padStart(2, "0")}.000Z`,
});

const chain = (call: Call, data: unknown) => {
  const obj: Record<string, unknown> = { data, error: null };
  obj.select = () => obj;
  obj.order = () => obj;
  obj.in = (col: string, vals: unknown[]) => {
    call.filters.push(`in:${col}:${vals.length}`);
    return obj;
  };
  obj.eq = (col: string, val: unknown) => {
    call.filters.push(`eq:${col}:${String(val)}`);
    return obj;
  };
  obj.or = (expr: string) => {
    call.filters.push(`or:${expr}`);
    return obj;
  };
  obj.limit = (n: number) => {
    call.limit = n;
    // The fake ignores filters and honours limit only — enough to exercise
    // the "one extra row → nextCursor" contract.
    obj.data = Array.isArray(data) ? data.slice(0, n) : data;
    return obj;
  };
  obj.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: obj.data, error: null }).then(resolve);
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      const call: Call = { table, filters: [] };
      state.calls.push(call);
      switch (table) {
        case "orders":
          return chain(call, state.orders);
        case "delivery_zones":
          return chain(call, [
            { id: "zone-even", name: "Even", eta_label: "30 min" },
            { id: "zone-odd", name: "Odd", eta_label: "45 min" },
          ]);
        case "coupons":
          return chain(call, [{ id: "coupon-3", code: "SAVE3" }]);
        default:
          return chain(call, []);
      }
    },
  }) as unknown as SupabaseClient;

beforeEach(() => {
  state.orders = [];
  state.calls = [];
});

describe("listOrders pagination", () => {
  it("asks for limit+1 rows and hands back a cursor when an older page exists", async () => {
    state.orders = [1, 2, 3, 4, 5].map(orderRow);
    const page = await listOrders(fakeDb(), { limit: 3 });
    const ordersCall = state.calls.find((c) => c.table === "orders");
    expect(ordersCall?.limit).toBe(4);
    expect(page.orders.map((o) => o.id)).toEqual([
      "PS-20260916-0001",
      "PS-20260916-0002",
      "PS-20260916-0003",
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeOrderCursor(page.nextCursor!)).toEqual({
      at: "2026-09-16T10:00:03.000Z",
      id: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("returns nextCursor null on the last page", async () => {
    state.orders = [1, 2].map(orderRow);
    const page = await listOrders(fakeDb(), { limit: 3 });
    expect(page.orders).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("applies the cursor as a keyset filter (created_at, id) and rejects garbage", async () => {
    state.orders = [4, 5].map(orderRow);
    const cursor = encodeOrderCursor({
      created_at: "2026-09-16T10:00:03.000Z",
      id: "00000000-0000-4000-8000-000000000003",
    });
    await listOrders(fakeDb(), { limit: 3, cursor });
    const ordersCall = state.calls.find((c) => c.table === "orders");
    expect(ordersCall?.filters).toContain(
      'or:created_at.lt."2026-09-16T10:00:03.000Z",and(created_at.eq."2026-09-16T10:00:03.000Z",id.lt.00000000-0000-4000-8000-000000000003)',
    );

    await expect(
      listOrders(fakeDb(), { cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(AdminInputError);
    const smuggled = Buffer.from(
      JSON.stringify({ at: "2026-09-16T10:00:03.000Z", id: "x),or(id.gt.0" }),
    ).toString("base64url");
    await expect(listOrders(fakeDb(), { cursor: smuggled })).rejects.toThrow(
      /Invalid cursor/,
    );
  });

  it("looks up only the zones and coupons the page references", async () => {
    state.orders = [1, 2, 3].map(orderRow);
    const page = await listOrders(fakeDb(), { limit: 10 });
    const zones = state.calls.find((c) => c.table === "delivery_zones");
    const coupons = state.calls.find((c) => c.table === "coupons");
    expect(zones?.filters).toEqual(["in:id:2"]);
    expect(coupons?.filters).toEqual(["in:id:1"]);
    expect(page.orders[2].coupon?.code).toBe("SAVE3");
    expect(page.orders[0].zoneName).toBe("Odd");
  });

  it("skips the coupon lookup entirely when no order on the page used one", async () => {
    state.orders = [1, 2].map(orderRow);
    await listOrders(fakeDb(), { limit: 10 });
    expect(state.calls.some((c) => c.table === "coupons")).toBe(false);
  });

  it("clamps the page size and quotes the search pattern", async () => {
    state.orders = [];
    await listOrders(fakeDb(), { limit: 99999, q: 'rah"at,%_x' });
    const ordersCall = state.calls.find((c) => c.table === "orders");
    expect(ordersCall?.limit).toBe(501);
    expect(ordersCall?.filters[0]).toBe(
      'or:order_no.ilike."%rahat,x%",customer_name.ilike."%rahat,x%",customer_phone.ilike."%rahat,x%"',
    );
  });
});
