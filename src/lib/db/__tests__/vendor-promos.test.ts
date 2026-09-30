/**
 * B3 (2026-09-28) — the vendor promo writes.
 *
 * The database is the last word (`ps_guard_vendor_promo`), but this layer must
 * (a) refuse locally with a readable reason before a round trip, (b) pass the
 * database's own refusal through unchanged when one happens anyway, and
 * (c) never invent a code the shop did not type — the code, the window and the
 * counter all come from the input, not from a default.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  promos: [] as Record<string, unknown>[],
  ledger: [] as { promo_discount: number | null }[],
  limitsRow: null as Record<string, unknown> | null,
  limitsError: null as { message: string } | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  filters: [] as [string, string][],
  insertError: null as { code?: string; message?: string } | null,
  updateError: null as { message: string } | null,
  /** The row the insert answers (null = the client returned nothing). */
  insertReturnsRow: true,
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = (col: string, val: unknown) => {
    state.filters.push([col, String(val)]);
    return obj;
  };
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.maybeSingle = () => obj;
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      switch (table) {
        case "coupons":
          return {
            select: () => chain(state.promos),
            insert: (vals: Record<string, unknown>) => {
              state.inserts.push(vals);
              const obj: Record<string, unknown> = {};
              obj.select = () => obj;
              obj.maybeSingle = async () =>
                state.insertError
                  ? { data: null, error: state.insertError }
                  : state.insertReturnsRow
                    ? { data: { ...vals, id: "c1", used: 0 }, error: null }
                    : { data: null, error: null };
              return obj;
            },
            update: (vals: Record<string, unknown>) => {
              state.updates.push(vals);
              const obj: Record<string, unknown> = {};
              obj.eq = (col: string, val: unknown) => {
                state.filters.push([col, String(val)]);
                return obj;
              };
              obj.select = () => obj;
              obj.maybeSingle = async () =>
                state.updateError
                  ? { data: null, error: state.updateError }
                  : { data: { ...state.promos[0], ...vals }, error: null };
              return obj;
            },
          };
        case "vendor_promo_limits":
          return {
            select: () =>
              state.limitsError ? chain(null, state.limitsError) : chain(state.limitsRow),
          };
        case "shop_ledger":
          return { select: () => chain(state.ledger) };
        default:
          return { select: () => chain([]) };
      }
    },
  }) as unknown as SupabaseClient;

const { createVendorPromo, promoBoard, readPromoLimits, setVendorPromoActive } = await import(
  "@/lib/db/vendor-promos"
);

const promoRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  code: "EID10",
  type: "percent",
  value: 10,
  min_order: 0,
  category_id: null,
  zone_id: null,
  max_discount: null,
  description: null,
  valid_from: "2026-09-28T00:00:00.000Z",
  valid_until: "2026-10-12T00:00:00.000Z",
  usage_limit: 50,
  used: 7,
  active: true,
  shop_id: "s1",
  created_by: "owner@shop.example",
  created_at: "2026-09-28T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  state.promos = [promoRow()];
  state.ledger = [{ promo_discount: 12_000 }, { promo_discount: 3_000 }];
  state.limitsRow = { max_percent: 25, max_discount: 50000, max_days: 30, max_usage: 300, max_active: 3 };
  state.limitsError = null;
  state.inserts = [];
  state.updates = [];
  state.filters = [];
  state.insertError = null;
  state.updateError = null;
  state.insertReturnsRow = true;
});

describe("readPromoLimits", () => {
  it("reads the platform caps", async () => {
    expect(await readPromoLimits(fakeDb())).toEqual({
      maxPercent: 25,
      maxDiscount: 50000,
      maxDays: 30,
      maxUsage: 300,
      maxActive: 3,
    });
  });

  it("falls back to the built-in defaults when the table is missing", async () => {
    state.limitsError = { message: "relation does not exist" };
    const limits = await readPromoLimits(fakeDb());
    expect(limits.maxPercent).toBe(25);
    expect(limits.maxUsage).toBe(300);
  });
});

describe("promoBoard", () => {
  it("counts the codes, the redemptions, and what the codes have cost", async () => {
    state.promos = [promoRow({ used: 7 }), promoRow({ id: "c2", code: "EID20", used: 3 })];
    const board = await promoBoard(fakeDb(), "s1");
    expect(board.promos).toHaveLength(2);
    expect(board.usedTotal).toBe(10);
    // Money that actually moved (the ledger), not money promised.
    expect(board.discountBornePaisa).toBe(15_000);
    expect(state.filters).toContainEqual(["shop_id", "s1"]);
  });

  it("reads an empty board instead of throwing when the table is absent", async () => {
    state.promos = [];
    state.ledger = [];
    const board = await promoBoard(fakeDb(), "s1");
    expect(board).toMatchObject({ promos: [], usedTotal: 0, discountBornePaisa: 0 });
  });
});

describe("createVendorPromo", () => {
  it("writes the code, its owner, the window and the counter", async () => {
    const now = Date.parse("2026-09-28T06:00:00.000Z");
    const promo = await createVendorPromo(fakeDb(), {
      shopId: "s1",
      by: "owner@shop.example",
      limits: { maxPercent: 25, maxDiscount: 50_000, maxDays: 30, maxUsage: 300, maxActive: 3 },
      now,
      raw: { code: "eid10", type: "percent", value: "10", days: 14, usageLimit: 50 },
    });
    const written = state.inserts[0];
    expect(written).toMatchObject({
      code: "EID10",
      type: "percent",
      value: 10,
      usage_limit: 50,
      used: 0,
      active: true,
      shop_id: "s1",
      created_by: "owner@shop.example",
      max_discount: null,
    });
    expect(written.valid_from).toBe("2026-09-28T06:00:00.000Z");
    expect(written.valid_until).toBe("2026-10-12T06:00:00.000Z");
    expect(promo.id).toBe("c1");
  });

  it("refuses a code past the caps before touching the database", async () => {
    await expect(
      createVendorPromo(fakeDb(), {
        shopId: "s1",
        limits: { maxPercent: 25, maxDiscount: 50_000, maxDays: 30, maxUsage: 300, maxActive: 3 },
        raw: { code: "BIG", type: "percent", value: 60, days: 5, usageLimit: 10 },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(state.inserts).toEqual([]);
  });

  it("passes the database's own refusal through unchanged", async () => {
    state.insertError = { code: "P0001", message: "at most 3 live promos per shop" };
    await expect(
      createVendorPromo(fakeDb(), {
        shopId: "s1",
        limits: { maxPercent: 25, maxDiscount: 50_000, maxDays: 30, maxUsage: 300, maxActive: 3 },
        raw: { code: "FOURTH", type: "percent", value: 5, days: 5, usageLimit: 10 },
      }),
    ).rejects.toMatchObject({ message: "at most 3 live promos per shop" });
  });

  it("names a duplicate code as a duplicate", async () => {
    state.insertError = { code: "23505", message: "duplicate key value" };
    await expect(
      createVendorPromo(fakeDb(), {
        shopId: "s1",
        limits: { maxPercent: 25, maxDiscount: 50_000, maxDays: 30, maxUsage: 300, maxActive: 3 },
        raw: { code: "EID10", type: "percent", value: 5, days: 5, usageLimit: 10 },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("setVendorPromoActive", () => {
  it("pauses the shop's own code", async () => {
    const promo = await setVendorPromoActive(fakeDb(), { shopId: "s1", id: "c1", active: false });
    expect(state.updates).toEqual([{ active: false }]);
    expect(promo.active).toBe(false);
  });

  it("404s when the code is not this shop's (RLS hides it)", async () => {
    state.updateError = { message: "no rows" };
    await expect(
      setVendorPromoActive(fakeDb(), { shopId: "s1", id: "someone-else", active: false }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
