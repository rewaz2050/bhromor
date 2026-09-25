/**
 * Audit 2026-09-17 P1.3 — `toDomainMany` maps N order rows with a FIXED
 * number of round trips. The old per-order mapper cost 8–10 queries per
 * order and the rider/dispatch/vendor lists called it in a loop, so a board
 * of 100 orders was ~900 Supabase requests (≈40 s from Dhaka).
 *
 * The double below records every `.from(table)` call with its `.in()` /
 * `.eq()` filters and answers from small fixtures, so the assertions are
 * about the SHAPE of the traffic, not just the output.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toDomain, toDomainMany } from "../orders";
import type { DbOrder } from "../types";

interface Call {
  table: string;
  filters: Record<string, unknown>;
}

const order = (over: Partial<DbOrder> & { id: string }): DbOrder =>
  ({
    shop_id: "shop-1",
    order_no: `PS-${over.id}`,
    customer_id: null,
    customer_name: "Rahat",
    customer_phone: "01712345678",
    area: "Sadar",
    address: "House 1",
    note: "",
    zone_id: "z1",
    subtotal: 50000,
    delivery_charge: 6000,
    discount: 0,
    coupon_id: null,
    total: 56000,
    payment: "cod",
    status: "pending",
    rider_id: null,
    delivery_code: null,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...over,
  }) as DbOrder;

/** Query double: answers each table from a fixture keyed by filters. */
const recordingDb = (fixtures: Record<string, (filters: Record<string, unknown>) => unknown[]>) => {
  const calls: Call[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const call: Call = { table, filters };
    calls.push(call);
    const chain = {
      select: () => chain,
      in: (col: string, values: unknown[]) => {
        filters[col] = values;
        return chain;
      },
      eq: (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      },
      order: () => chain,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: fixtures[table]?.(filters) ?? [], error: null }).then(resolve),
    };
    return chain;
  };
  return { db: { from } as never, calls };
};

const FIXTURES = {
  order_items: (f: Record<string, unknown>) =>
    (f.order_id as string[]).map((oid) => ({
      id: `it-${oid}`,
      order_id: oid,
      product_id: oid === "o3" ? null : "p1",
      variant_id: null,
      name: "Panjabi",
      sku: "SKU1",
      variant: "Black · M",
      unit_price: 50000,
      qty: 1,
    })),
  order_status_history: (f: Record<string, unknown>) =>
    (f.order_id as string[]).map((oid) => ({
      id: `h-${oid}`,
      order_id: oid,
      status: "pending",
      note: null,
      changed_by: null,
      created_at: "2026-09-17T00:00:00.000Z",
    })),
  delivery_zones: () => [{ id: "z1", name: "Sadar", eta_label: "45 min" }],
  coupons: () => [{ id: "c1", code: "EID10" }],
  orders: (f: Record<string, unknown>) => {
    if (Array.isArray(f.return_parent_id)) {
      // newest first, as the real query orders it — o1 has two children, the
      // newest one wins and the rejected one is ignored.
      return [
        { return_parent_id: "o1", order_no: "PS-R2", status: "pending", return_status: "requested" },
        { return_parent_id: "o1", order_no: "PS-R1", status: "cancelled", return_status: "rejected" },
      ];
    }
    if (Array.isArray(f.id)) return [{ id: "o1", order_no: "PS-o1" }];
    return [];
  },
  delivery_assignments: (f: Record<string, unknown>) =>
    (f.order_id as string[]).includes("o2")
      ? [
          { order_id: "o2", rider_id: "r-new" },
          { order_id: "o2", rider_id: "r-old" },
        ]
      : [],
  products: () => [{ id: "p1", slug: "panjabi", warranty_days: 30 }],
  product_media: () => [
    { product_id: "p1", url: "https://img/1.jpg" },
    { product_id: "p1", url: "https://img/2.jpg" },
  ],
  riders: () => [{ id: "r-new", name: "Karim", phone: "01800000000", rating_avg: 4.5, rating_count: 12 }],
};

const ORDERS: DbOrder[] = [
  order({ id: "o1", status: "delivered", coupon_id: "c1", discount: 1000 }),
  order({ id: "o2", status: "out-for-delivery", delivery_code: "4321" }),
  order({ id: "o3", status: "pending" }),
  order({ id: "o4", status: "pending", is_return: true, return_parent_id: "o1", zone_id: "z-missing" }),
];

describe("toDomainMany (batched order mapper)", () => {
  it("maps four orders in two rounds of .in() queries — never one query per order", async () => {
    const { db, calls } = recordingDb(FIXTURES);
    const out = await toDomainMany(db, ORDERS);
    expect(out).toHaveLength(4);
    expect(out.every((o) => o !== null)).toBe(true);

    const tables = calls.map((c) => c.table);
    // exactly one items and one history query for the whole batch
    expect(tables.filter((t) => t === "order_items")).toHaveLength(1);
    expect(tables.filter((t) => t === "order_status_history")).toHaveLength(1);
    expect(calls.find((c) => c.table === "order_items")?.filters.order_id).toEqual([
      "o1",
      "o2",
      "o3",
      "o4",
    ]);
    // products / media / riders once each, on the de-duplicated id sets
    expect(tables.filter((t) => t === "products")).toHaveLength(1);
    expect(calls.find((c) => c.table === "products")?.filters.id).toEqual(["p1"]);
    expect(tables.filter((t) => t === "riders")).toHaveLength(1);
    expect(calls.find((c) => c.table === "riders")?.filters.id).toEqual(["r-new"]);
    // a bounded total: 7 in round one + 3 in round two, whatever N is
    expect(calls.length).toBeLessThanOrEqual(10);
  });

  it("only asks about riders for orders that are actually in the rider leg", async () => {
    const { db, calls } = recordingDb(FIXTURES);
    await toDomainMany(db, ORDERS);
    const assignments = calls.find((c) => c.table === "delivery_assignments");
    expect(assignments?.filters.state).toEqual(["accepted", "picked_up", "delivered"]);
    expect(assignments?.filters.order_id).toEqual(["o1", "o2"]); // delivered + out-for-delivery
  });

  it("keeps every per-order enrichment the old mapper produced", async () => {
    const { db } = recordingDb(FIXTURES);
    const [o1, o2, o3, o4] = await toDomainMany(db, ORDERS);

    // zone + coupon + item snapshot enrichment
    expect(o1?.zoneName).toBe("Sadar");
    expect(o1?.etaLabel).toBe("45 min");
    expect(o1?.coupon).toEqual({ code: "EID10", discount: 1000 });
    expect(o1?.items[0]).toMatchObject({
      image: "https://img/1.jpg", // first image by sort order, not the last
      warrantyDays: 30,
    });
    // P1 #13 — newest non-rejected return child on the parent
    expect(o1?.returnChild).toEqual({ orderNo: "PS-R2", status: "pending", returnStatus: "requested" });
    // no rider on a delivered order that never had an assignment
    expect(o1?.rider).toBeUndefined();

    // rider leg: latest assignment wins, delivery code carried
    expect(o2?.rider).toEqual({
      id: "r-new",
      name: "Karim",
      phone: "01800000000",
      ratingAvg: 4.5,
      ratingCount: 12,
    });
    expect(o2?.deliveryCode).toBe("4321");

    // item without a product id still maps (no enrichment)
    expect(o3?.items[0]).toMatchObject({ image: "" });
    expect(o3?.rider).toBeUndefined();

    // return pickup: parent's public number, unknown zone falls back to id
    expect(o4?.returnParentOrderNo).toBe("PS-o1");
    expect(o4?.zoneName).toBe("z-missing");
    expect(o4?.returnChild).toBeUndefined();
  });

  it("returns an empty array without touching the database for no rows", async () => {
    const { db, calls } = recordingDb(FIXTURES);
    expect(await toDomainMany(db, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("toDomain is the single-row view of the same mapper", async () => {
    const { db } = recordingDb(FIXTURES);
    const one = await toDomain(db, ORDERS[1]);
    expect(one?.id).toBe("PS-o2");
    expect(one?.rider?.name).toBe("Karim");
  });

  it("answers null for every row when the items read fails (never a half order)", async () => {
    const failing = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          in: () => chain,
          eq: () => chain,
          order: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              table === "order_items"
                ? { data: null, error: { message: "permission denied" } }
                : { data: [], error: null },
            ).then(resolve),
        };
        return chain;
      },
    } as never;
    expect(await toDomainMany(failing, ORDERS.slice(0, 2))).toEqual([null, null]);
  });
});
