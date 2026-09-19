/**
 * Audit 2026-09-17 P1.4 — `loadOrderSnapshot` reads only what the request
 * can need. Before: every order AND every coupon check ran 11 queries,
 * including `count(*)` over orders, up to 5000 customer phones and the whole
 * referral ledger. These tests pin the scoping rules on a recording double.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Call {
  table: string;
  filters: Record<string, unknown>;
  ops: string[];
}

const calls = vi.hoisted(() => [] as { table: string; filters: Record<string, unknown>; ops: string[] }[]);

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: (table: string) => {
      const call: Call = { table, filters: {}, ops: [] };
      calls.push(call);
      const rows = (): unknown[] => {
        switch (table) {
          case "products":
            return [
              {
                id: "p1",
                shop_id: "s1",
                slug: "panjabi",
                name: "Panjabi",
                name_bn: "",
                sku: "SKU1",
                category_id: "c1",
                subcategory: "Panjabi",
                short_description: "desc",
                description: "desc",
                details: [],
                price: 50000,
                compare_at_price: null,
                featured: false,
                is_new: false,
                in_stock: true,
                low_stock: false,
                status: "published",
                active: true,
                seo_title: null,
                seo_description: null,
              },
            ];
          case "delivery_zones":
            return [{ id: "z1", name: "Sadar", areas: [], charge: 6000, eta_label: "45 min", active: true, sort_order: 1 }];
          case "coupons":
            return [];
          case "shops":
            return [];
          case "referral_codes":
            return [{ code: "AB12CD", customer_id: null, customer_phone: "01799999999", customer_name: "Friend" }];
          case "referral_rewards":
            // the code-scoped read and the phone-scoped read overlap on one row
            return call.filters.code
              ? [
                  { code: "AB12CD", referee_phone: "01712345678" },
                  { code: "AB12CD", referee_phone: "01700000001" },
                ]
              : [{ code: "AB12CD", referee_phone: "01712345678" }];
          case "orders":
            return [
              { customer_phone: "01712345678" },
              { customer_phone: "+8801712345678" },
              { customer_phone: "01712345670" }, // needle over-match, filtered in JS
            ];
          default:
            return [];
        }
      };
      const chain = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) call.ops.push("count");
          return chain;
        },
        eq: (col: string, v: unknown) => {
          call.filters[col] = v;
          return chain;
        },
        neq: (col: string, v: unknown) => {
          call.filters[`${col}!`] = v;
          return chain;
        },
        ilike: (col: string, v: unknown) => {
          call.filters[`${col}~`] = v;
          return chain;
        },
        order: () => chain,
        limit: (n: number) => {
          call.ops.push(`limit:${n}`);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null; count: null }) => unknown) =>
          Promise.resolve({ data: rows(), error: null, count: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

import { loadOrderSnapshot } from "../orders";

const tables = () => calls.map((c) => c.table);

describe("loadOrderSnapshot scoping (P1.4)", () => {
  it("pricing scope reads catalog + coupons only — no shops, ops, orders or referral ledger", async () => {
    calls.length = 0;
    const snap = await loadOrderSnapshot({ scope: "pricing" });
    expect(snap?.products).toHaveLength(1);
    expect(snap?.zones).toHaveLength(1);
    expect(snap?.shops).toEqual([]);
    expect(snap?.promos).toBeUndefined();
    const t = tables();
    expect(t).toEqual(
      expect.arrayContaining(["products", "product_variants", "product_media", "delivery_zones", "coupons"]),
    );
    expect(t).not.toContain("shops");
    expect(t).not.toContain("site_settings");
    expect(t).not.toContain("orders");
    expect(t).not.toContain("referral_codes");
    expect(t).not.toContain("referral_rewards");
  });

  it("a plain checkout read never counts all orders nor ships every customer phone", async () => {
    calls.length = 0;
    const snap = await loadOrderSnapshot({ scope: "checkout", phone: "01712345678" });
    expect(snap?.shops).toEqual([]);
    expect(snap?.promos).toBeDefined();
    expect(tables()).toContain("shops");
    expect(tables()).toContain("site_settings");
    // no referral code typed → the ledger is not read at all, and the phone
    // scope is not needed either (first-order proof only matters for referrals)
    expect(tables()).not.toContain("referral_codes");
    expect(tables()).not.toContain("referral_rewards");
    expect(tables()).not.toContain("orders");
    expect(calls.some((c) => c.ops.includes("count"))).toBe(false);
    expect(snap?.totalOrders).toBeUndefined();
    expect(snap?.priorOrderPhones).toBeUndefined();
  });

  it("with a referral code: ledger rows for THAT code, orders/rewards for THIS phone only", async () => {
    calls.length = 0;
    const snap = await loadOrderSnapshot({
      scope: "checkout",
      phone: "+88 01712-345678",
      referralCode: "ps-ab12cd",
    });
    const codes = calls.find((c) => c.table === "referral_codes");
    expect(codes?.filters.code).toBe("AB12CD");
    const rewards = calls.filter((c) => c.table === "referral_rewards");
    expect(rewards.map((r) => r.filters)).toEqual([
      { code: "AB12CD" },
      { "referee_phone~": "%1%7%1%2%3%4%5%6%7%8%" },
    ]);
    const orders = calls.find((c) => c.table === "orders");
    expect(orders?.filters).toEqual({
      "status!": "cancelled",
      "customer_phone~": "%1%7%1%2%3%4%5%6%7%8%",
    });
    expect(orders?.ops).not.toContain("limit:5000");

    // exact phone match in JS: the +88 spelling counts, the over-match does not
    expect(snap?.customerOrderCount).toBe(2);
    expect(snap?.referralRecords).toEqual([
      expect.objectContaining({ code: "AB12CD", referrerPhone: "01799999999", rewardsGranted: 2 }),
    ]);
    // the overlapping (code, phone) reward row is de-duplicated
    expect(snap?.referralRewards).toEqual([
      { code: "AB12CD", refereePhone: "01712345678" },
      { code: "AB12CD", refereePhone: "01700000001" },
    ]);
  });

  it("a malformed referral code does not trigger the ledger reads (the validator rejects it)", async () => {
    calls.length = 0;
    await loadOrderSnapshot({ scope: "checkout", phone: "01712345678", referralCode: "01712345678" });
    expect(tables()).not.toContain("referral_codes");
    expect(tables()).not.toContain("orders");
  });
});
