import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { oneShopTotals, shopBalanceTotals } from "../shop-balances";

type Row = Record<string, unknown>;

/** A paging fake: honours order/eq/range like PostgREST, and caps nothing itself. */
const pagingDb = (tables: Record<string, Row[]>, rpc: unknown) =>
  ({
    rpc: async () => rpc,
    from: (table: string) => {
      let rows = tables[table] ?? [];
      const q = {
        select: () => q,
        order: () => q,
        eq: (col: string, v: unknown) => {
          rows = rows.filter((r) => r[col] === v);
          return q;
        },
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
      };
      return q;
    },
  }) as never;

describe("shopBalanceTotals", () => {
  it("reads the database aggregate (numbers may arrive as strings from bigint)", async () => {
    const db = pagingDb({}, {
      data: [
        { shop_id: "a", earned: "840000", paid: "100", last_payout_at: "2026-09-05T00:00:00Z" },
        { shop_id: "b", earned: 0, paid: 0, last_payout_at: null },
      ],
      error: null,
    });
    const t = await shopBalanceTotals(db);
    expect(t.get("a")).toEqual({ earned: 840000, paid: 100, lastPayoutAt: Date.parse("2026-09-05T00:00:00Z") });
    expect(t.get("b")?.lastPayoutAt).toBeNull();
  });

  it("without the migration pages through EVERY row — past the 1,000-row response cap", async () => {
    const ledger = Array.from({ length: 2300 }, (_, i) => ({ id: `l${i}`, shop_id: "a", payable: 10 }));
    const payouts = [
      { id: "p1", shop_id: "a", amount: 500, paid_at: "2026-09-01T00:00:00Z" },
      { id: "p2", shop_id: "a", amount: 700, paid_at: "2026-09-09T00:00:00Z" },
    ];
    const db = pagingDb({ shop_ledger: ledger, shop_payouts: payouts }, { data: null, error: { message: "function does not exist" } });
    const t = await shopBalanceTotals(db);
    expect(t.get("a")).toEqual({ earned: 23000, paid: 1200, lastPayoutAt: Date.parse("2026-09-09T00:00:00Z") });
  });

  it("oneShopTotals filters to the shop and defaults to zeros", async () => {
    const db = pagingDb({ shop_ledger: [{ id: "l", shop_id: "a", payable: 5 }], shop_payouts: [] }, { data: null, error: { message: "x" } });
    expect(await oneShopTotals(db, "a")).toEqual({ earned: 5, paid: 0, lastPayoutAt: null });
    expect(await oneShopTotals(db, "zzz")).toEqual({ earned: 0, paid: 0, lastPayoutAt: null });
  });

  it("a failing fallback read is an error, not a silent zero", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: "nope" } }),
      from: () => {
        const q = { select: () => q, order: () => q, eq: () => q, range: async () => ({ data: null, error: { message: "boom" } }) };
        return q;
      },
    } as never;
    await expect(shopBalanceTotals(db)).rejects.toThrow(/totals failed/);
  });
});
