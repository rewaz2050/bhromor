/**
 * B4 (2026-09-28) — the shop's funnel, as numbers and as words.
 *
 * The risk with any funnel chart is that it flatters: a 100% conversion built
 * on two visits, a "50%" that is really 1 of 2, or a week that simply has no
 * data shown as a verdict. These tests pin the opposite behaviour — thin steps
 * are labelled, quiet weeks are named, and the advice points at the one step
 * there is actually evidence for.
 */
import { describe, expect, it } from "vitest";
import {
  SMALL_BASE,
  emptyShopFunnel,
  funnelAdvice,
  funnelIsQuiet,
  funnelSteps,
  isThin,
  parseShopFunnel,
  shopFunnelRates,
  type ShopFunnel,
} from "@/lib/shop-funnel";

const funnel = (over: Partial<ShopFunnel> = {}): ShopFunnel => ({
  days: 7,
  shopId: "s1",
  sessions: 400,
  pageViews: 520,
  pdpSessions: 200,
  addToCartSessions: 80,
  checkoutSessions: 40,
  purchaseSessions: 25,
  orders: 30,
  revenue: 4_500_000,
  aov: 150_000,
  units: 44,
  atcBySource: [{ source: "pdp", count: 50 }, { source: "card", count: 30 }],
  topProducts: [
    { productId: "p1", name: "Saree", slug: "saree-1", views: 120, adds: 40, orders: 18 },
  ],
  ...over,
});

describe("shopFunnelRates", () => {
  it("walks the steps with orders from the orders table", () => {
    const rates = shopFunnelRates(funnel());
    expect(rates.viewRate).toBe(0.5); // 200/400
    expect(rates.addRate).toBe(0.4); // 80/200
    expect(rates.checkoutRate).toBe(0.5); // 40/80
    expect(rates.orderRate).toBe(0.75); // 30/40
    expect(rates.sessionToOrder).toBe(0.075); // 30/400
  });

  it("answers 0 instead of dividing by nothing", () => {
    const rates = shopFunnelRates(funnel({ sessions: 0, pdpSessions: 0, addToCartSessions: 0, checkoutSessions: 0 }));
    expect(Object.values(rates).every((r) => r === 0)).toBe(true);
  });
});

describe("thin steps", () => {
  it("marks a small base as too small to read", () => {
    expect(isThin(SMALL_BASE - 1)).toBe(true);
    expect(isThin(SMALL_BASE)).toBe(false);
  });

  it("labels the thin steps in order", () => {
    const thin = funnelSteps(funnel({ sessions: 120, pdpSessions: 8, addToCartSessions: 3, checkoutSessions: 1 }));
    expect(thin.map((s) => s.thin)).toEqual([false, true, true, true]);
  });
});

describe("funnelAdvice", () => {
  it("names a quiet week as no data, not as a bad week", () => {
    const quiet = emptyShopFunnel(7);
    expect(funnelIsQuiet(quiet)).toBe(true);
    expect(funnelAdvice(quiet)).toMatch(/no visitors recorded/i);
  });

  it("points at the worst step it has evidence for", () => {
    // Checkout → order is the collapse (40 → 2), and both steps are big enough
    // to talk about, so that is what it should name.
    const advice = funnelAdvice(funnel({ orders: 2, revenue: 300_000, aov: 150_000 }));
    expect(advice).toMatch(/cancelled|not confirmed/i);
  });

  it("blames the bag when products are looked at but not added", () => {
    const advice = funnelAdvice(
      funnel({ sessions: 300, pdpSessions: 150, addToCartSessions: 5, checkoutSessions: 4, orders: 3 }),
    );
    expect(advice).toMatch(/price|sizes|stock/i);
  });

  it("blames the product opening when the storefront is visited but nothing is opened", () => {
    const advice = funnelAdvice(
      funnel({ sessions: 300, pdpSessions: 10, addToCartSessions: 8, checkoutSessions: 6, orders: 5 }),
    );
    expect(advice).toMatch(/photo|titles/i);
  });

  it("says the steps hold up when they do", () => {
    const advice = funnelAdvice(
      funnel({ sessions: 300, pdpSessions: 290, addToCartSessions: 280, checkoutSessions: 275, orders: 270 }),
    );
    expect(advice).toMatch(/holding up|more visitors/i);
  });

  it("admits when there is too little to read anything", () => {
    const advice = funnelAdvice(funnel({ sessions: 4, pdpSessions: 2, addToCartSessions: 1, checkoutSessions: 0, orders: 0 }));
    expect(advice).toMatch(/too few/i);
  });
});

describe("parseShopFunnel", () => {
  it("reads the shape ps_shop_funnel_report returns", () => {
    const parsed = parseShopFunnel(
      {
        days: 28,
        shop_id: "s1",
        sessions: 12,
        page_views: 30,
        pdp_sessions: 9,
        atc_sessions: 4,
        checkout_sessions: 2,
        purchase_sessions: 1,
        orders: 2,
        revenue: 300000,
        aov: 150000,
        units: 3,
        atc_by_source: [{ source: "card", count: 4 }],
        top_products: [{ product_id: "p1", name: "Saree", slug: "saree-1", views: 9, adds: 4, orders: 2 }],
      },
      7,
    );
    expect(parsed.days).toBe(28);
    expect(parsed.addToCartSessions).toBe(4);
    expect(parsed.aov).toBe(150_000);
    expect(parsed.topProducts[0]).toMatchObject({ name: "Saree", views: 9, orders: 2 });
  });

  it("keeps a week with no orders honest: AOV is null, not 0", () => {
    const parsed = parseShopFunnel({ shop_id: "s1", sessions: 5, orders: 0, aov: null }, 7);
    expect(parsed.orders).toBe(0);
    expect(parsed.aov).toBeNull();
  });

  it("survives junk without throwing", () => {
    for (const raw of [null, undefined, "x", 42, []]) {
      const parsed = parseShopFunnel(raw, 7);
      expect(parsed.shopId).toBeNull();
      expect(parsed.sessions).toBe(0);
      expect(parsed.atcBySource).toEqual([]);
    }
  });
});
