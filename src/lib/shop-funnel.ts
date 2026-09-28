/**
 * B4 (2026-09-28) — the shop's own funnel, as the vendor dashboard prints it.
 *
 * The market-wide funnel (lib/funnel-events.ts) is staff's view; this is the
 * number a shop can act on: of the people who opened MY storefront, how many
 * looked at a product, put one in the bag, started checkout, and actually
 * bought. Two rules shape it:
 *
 *   1. ORDERS COME FROM `orders`, not from the browser. A cancelled or return
 *      order is not a sale, and a client ping is not money either.
 *   2. THE SHOP SEES ITS OWN NUMBERS ONLY — the function is called with the
 *      shop id of the verified vendor session (never a client-supplied id).
 *
 * Also the only honest thing to do with a thin week: say so. A step built on
 * fewer than `SMALL_BASE` sessions is marked "not enough data yet" rather than
 * shown as 0% (which reads like a verdict) or 42% (which is noise).
 */

/** Below this many sessions a rate is a coin toss, not a fact. */
export const SMALL_BASE = 20;

export interface ShopTopProduct {
  productId: string;
  name: string;
  slug?: string;
  views: number;
  adds: number;
  orders: number;
}

export interface ShopFunnel {
  days: number;
  /** Shop the report is about (echo of the server-scoped id). */
  shopId: string | null;
  /** Distinct sessions that did anything on this shop's pages. */
  sessions: number;
  /** Page views of the shop's own storefront page. */
  pageViews: number;
  /** Sessions that viewed a product of this shop. */
  pdpSessions: number;
  addToCartSessions: number;
  checkoutSessions: number;
  /** Sessions that fired the client `purchase` ping (not the source of truth). */
  purchaseSessions: number;
  /** Real orders (non-cancelled, non-return) in the window. */
  orders: number;
  /** Revenue of those orders, paisa. */
  revenue: number;
  /** Average order value, paisa; null when there were no orders. */
  aov: number | null;
  units: number;
  atcBySource: { source: string; count: number }[];
  topProducts: ShopTopProduct[];
}

export interface ShopFunnelRates {
  /** Sessions that opened a product / sessions that reached the shop. */
  viewRate: number;
  /** Added to bag / viewed a product. */
  addRate: number;
  /** Started checkout / added to bag. */
  checkoutRate: number;
  /** Real orders / started checkout. */
  orderRate: number;
  /** Real orders / every session — the number a shop actually cares about. */
  sessionToOrder: number;
}

const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);

export const shopFunnelRates = (r: ShopFunnel): ShopFunnelRates => ({
  viewRate: ratio(r.pdpSessions, r.sessions),
  addRate: ratio(r.addToCartSessions, r.pdpSessions),
  checkoutRate: ratio(r.checkoutSessions, r.addToCartSessions),
  orderRate: ratio(r.orders, r.checkoutSessions),
  sessionToOrder: ratio(r.orders, r.sessions),
});

/** A step whose base is too small to say anything about. */
export const isThin = (base: number): boolean => base < SMALL_BASE;

/** The four steps, in the order a shop reads them. */
export const funnelSteps = (
  r: ShopFunnel,
): { key: keyof ShopFunnelRates; label: string; from: number; to: number; rate: number; thin: boolean }[] => {
  const rates = shopFunnelRates(r);
  return [
    { key: "viewRate", label: "Opened a product", from: r.sessions, to: r.pdpSessions, rate: rates.viewRate, thin: isThin(r.sessions) },
    { key: "addRate", label: "Added to bag", from: r.pdpSessions, to: r.addToCartSessions, rate: rates.addRate, thin: isThin(r.pdpSessions) },
    { key: "checkoutRate", label: "Started checkout", from: r.addToCartSessions, to: r.checkoutSessions, rate: rates.checkoutRate, thin: isThin(r.addToCartSessions) },
    { key: "orderRate", label: "Ordered", from: r.checkoutSessions, to: r.orders, rate: rates.orderRate, thin: isThin(r.checkoutSessions) },
  ];
};

/** Nothing happened at all — before the migration is run, or a dead week. */
export const funnelIsQuiet = (r: ShopFunnel): boolean =>
  r.sessions === 0 && r.pageViews === 0 && r.orders === 0;

/**
 * The one line under the numbers. It names the biggest leak it can PROVE
 * (a thin step is skipped, and a quiet week is stated plainly) — never a guess.
 */
export const funnelAdvice = (r: ShopFunnel): string => {
  if (funnelIsQuiet(r)) {
    return "No visitors recorded yet. This fills up as people open your storefront and products.";
  }
  // The leak worth naming is the biggest drop between two steps that both have
  // enough sessions behind them to mean something.
  const steps = funnelSteps(r).filter((s) => !s.thin && s.from > 0);
  if (steps.length === 0) {
    return `Only ${r.sessions} ${r.sessions === 1 ? "visit" : "visits"} so far — too few to read a pattern. Keep an eye on it as it grows.`;
  }
  const worst = steps.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (worst.rate >= 0.9) {
    return "Every step is holding up. With more visitors the same rates mean more orders.";
  }
  switch (worst.key) {
    case "viewRate":
      return "People reach your storefront but few open a product — a stronger first photo or clearer titles should move this.";
    case "addRate":
      return "Products get looked at but not added — check the price, the visible sizes, and whether stock shows.";
    case "checkoutRate":
      return "Bags get filled but checkout is not finished — this is often the delivery charge or a confusing step at the end.";
    case "orderRate":
    default:
      return "Checkout is started but orders do not land — many of these are cancelled or never confirmed.";
  }
};

/** Coerce whatever the RPC returned into the typed shape (never throws). */
export const parseShopFunnel = (raw: unknown, days: number): ShopFunnel => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown): number => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const nullable = (v: unknown): number | null =>
    v === null || v === undefined || v === false || v === "" ? null : n(v);
  const list = <T>(v: unknown, map: (x: Record<string, unknown>) => T): T[] =>
    Array.isArray(v)
      ? v.filter((x) => x && typeof x === "object").map((x) => map(x as Record<string, unknown>))
      : [];
  const shopId = typeof r.shop_id === "string" && r.shop_id !== "" ? r.shop_id : null;
  const orders = n(r.orders);
  return {
    days: n(r.days) || days,
    shopId,
    sessions: n(r.sessions),
    pageViews: n(r.page_views),
    pdpSessions: n(r.pdp_sessions),
    addToCartSessions: n(r.atc_sessions),
    checkoutSessions: n(r.checkout_sessions),
    purchaseSessions: n(r.purchase_sessions),
    orders,
    revenue: n(r.revenue),
    aov: nullable(r.aov),
    units: n(r.units),
    atcBySource: list(r.atc_by_source, (x) => ({
      source: String(x.source ?? "other"),
      count: n(x.count),
    })),
    topProducts: list(r.top_products, (x) => ({
      productId: String(x.product_id ?? ""),
      name: String(x.name ?? "(removed product)"),
      slug: typeof x.slug === "string" && x.slug !== "" ? x.slug : undefined,
      views: n(x.views),
      adds: n(x.adds),
      orders: n(x.orders),
    })),
  };
};

/** Empty report — what a shop sees before any event has been recorded. */
export const emptyShopFunnel = (days: number): ShopFunnel => ({
  days,
  shopId: null,
  sessions: 0,
  pageViews: 0,
  pdpSessions: 0,
  addToCartSessions: 0,
  checkoutSessions: 0,
  purchaseSessions: 0,
  orders: 0,
  revenue: 0,
  aov: null,
  units: 0,
  atcBySource: [],
  topProducts: [],
});
