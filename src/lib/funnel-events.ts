/**
 * First-party funnel events (UX plan §0, 2026-09-26) — the pure part.
 *
 * The storefront already tells Meta / GA4 about the funnel when their ids are
 * configured (`lib/analytics.ts`). This is the SHOP'S OWN copy: a small,
 * anonymous event row per action, batched to `POST /api/events`, so Admin →
 * Reports can show bounce, pages/session, PDP→bag→checkout→order rates, AOV
 * and repeat rate without depending on a third-party dashboard.
 *
 * Nothing personal is recorded: an anonymous per-tab session id, the event,
 * the path, a product/shop id, where the tap came from, a number, the
 * language. Never the phone, name or address.
 *
 * Shared by the browser sink, the API validator and the tests — the same
 * names and limits on both ends.
 */

export const FUNNEL_EVENT_NAMES = [
  "page_view",
  "view_item_list",
  "select_item",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
  "search",
  "scroll_depth",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** One wire-format event (short keys — a batch rides in a sendBeacon body). */
export interface WireEvent {
  /** Event name. */
  t: FunnelEventName;
  /** Pathname (no query, no hash). */
  p?: string;
  /** Product id. */
  pid?: string;
  /** Shop id. */
  shop?: string;
  /** Where it came from: a rail name, 'card' | 'pdp' | 'bundle' | 'live' … */
  src?: string;
  /** A number: paisa for money events, result count for search, % for scroll. */
  v?: number;
  /** Language the shopper was reading. */
  lang?: "en" | "bn";
  /** Small extra facts (e.g. the search query). */
  meta?: Record<string, string | number | boolean>;
}

export interface WireBatch {
  sid: string;
  events: WireEvent[];
}

export const MAX_BATCH_EVENTS = 25;
export const SESSION_ID_RE = /^[a-z0-9]{8,64}$/;

const MAX_TEXT = 120;
const MAX_META_KEYS = 6;
const MAX_META_VALUE = 200;

const text = (v: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t === "" ? undefined : t;
};

const pathOnly = (v: unknown): string | undefined => {
  const t = text(v, 300);
  if (!t) return undefined;
  const clean = t.split(/[?#]/)[0];
  return clean.startsWith("/") ? clean.slice(0, MAX_TEXT) : undefined;
};

const number = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;

/** One incoming event → a clean one, or null when it is not an event at all. */
export const sanitizeWireEvent = (raw: unknown): WireEvent | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = r.t;
  if (typeof t !== "string" || !(FUNNEL_EVENT_NAMES as readonly string[]).includes(t)) return null;
  const out: WireEvent = { t: t as FunnelEventName };
  const p = pathOnly(r.p);
  if (p) out.p = p;
  const pid = text(r.pid, 80);
  if (pid) out.pid = pid;
  const shop = text(r.shop, 80);
  if (shop) out.shop = shop;
  const src = text(r.src, 60);
  if (src) out.src = src;
  const v = number(r.v);
  if (v !== undefined) out.v = v;
  if (r.lang === "en" || r.lang === "bn") out.lang = r.lang;
  if (r.meta && typeof r.meta === "object" && !Array.isArray(r.meta)) {
    const meta: Record<string, string | number | boolean> = {};
    for (const [k, val] of Object.entries(r.meta as Record<string, unknown>).slice(0, MAX_META_KEYS)) {
      const key = k.slice(0, 40);
      if (typeof val === "string") meta[key] = val.slice(0, MAX_META_VALUE);
      else if (typeof val === "number" && Number.isFinite(val)) meta[key] = val;
      else if (typeof val === "boolean") meta[key] = val;
    }
    if (Object.keys(meta).length > 0) out.meta = meta;
  }
  return out;
};

/** A whole POST body → a clean batch, or null when unusable. */
export const sanitizeWireBatch = (raw: unknown): WireBatch | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sid = typeof r.sid === "string" ? r.sid.trim().toLowerCase() : "";
  if (!SESSION_ID_RE.test(sid)) return null;
  if (!Array.isArray(r.events)) return null;
  const events = r.events
    .slice(0, MAX_BATCH_EVENTS)
    .map(sanitizeWireEvent)
    .filter((e): e is WireEvent => e !== null);
  if (events.length === 0) return null;
  return { sid, events };
};

/* ------------------------------------------------------------------ */
/* Funnel report shape (what ps_funnel_report returns, typed)          */
/* ------------------------------------------------------------------ */

export interface FunnelReport {
  days: number;
  /** Distinct sessions with at least one page view. */
  sessions: number;
  pageViews: number;
  /** Sessions with exactly one page view / sessions. 0–1. */
  bounceRate: number;
  pagesPerSession: number;
  /** Distinct sessions that reached each step. */
  pdpSessions: number;
  atcSessions: number;
  checkoutSessions: number;
  purchaseSessions: number;
  /** From the orders table (truth): non-cancelled, non-return orders in the window. */
  orders: number;
  /** Average order total, paisa. */
  aov: number;
  /** Customers with an order in the window that already had an earlier order / customers. 0–1. */
  repeatRate: number;
  customers: number;
  /** Where adds to bag came from. */
  atcBySource: { source: string; count: number }[];
  /** Most typed searches, with the result count the shopper saw. */
  topSearches: { query: string; count: number; zeroResults: boolean }[];
  /** Share of home sessions that scrolled past each mark. 0–1. */
  homeScroll: { depth: number; share: number }[];
}

const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);

/** The step conversions the Reports card prints, from one report. */
export const funnelRates = (r: FunnelReport) => ({
  pdpToAtc: ratio(r.atcSessions, r.pdpSessions),
  atcToCheckout: ratio(r.checkoutSessions, r.atcSessions),
  checkoutToOrder: ratio(r.orders, r.checkoutSessions),
  sessionToOrder: ratio(r.orders, r.sessions),
});

/** Empty report — what a database without the events table shows. */
export const EMPTY_FUNNEL: FunnelReport = {
  days: 7,
  sessions: 0,
  pageViews: 0,
  bounceRate: 0,
  pagesPerSession: 0,
  pdpSessions: 0,
  atcSessions: 0,
  checkoutSessions: 0,
  purchaseSessions: 0,
  orders: 0,
  aov: 0,
  repeatRate: 0,
  customers: 0,
  atcBySource: [],
  topSearches: [],
  homeScroll: [],
};

/** Coerce whatever the RPC returned into the typed shape (never throws). */
export const parseFunnelReport = (raw: unknown, days: number): FunnelReport => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const list = <T>(v: unknown, map: (x: Record<string, unknown>) => T): T[] =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => map(x as Record<string, unknown>)) : [];
  const sessions = n(r.sessions);
  const pageViews = n(r.page_views);
  const bounced = n(r.bounced_sessions);
  return {
    days,
    sessions,
    pageViews,
    bounceRate: ratio(bounced, sessions),
    pagesPerSession: ratio(pageViews, sessions),
    pdpSessions: n(r.pdp_sessions),
    atcSessions: n(r.atc_sessions),
    checkoutSessions: n(r.checkout_sessions),
    purchaseSessions: n(r.purchase_sessions),
    orders: n(r.orders),
    aov: n(r.aov),
    repeatRate: ratio(n(r.repeat_customers), n(r.customers)),
    customers: n(r.customers),
    atcBySource: list(r.atc_by_source, (x) => ({ source: String(x.source ?? "unknown"), count: n(x.count) })),
    topSearches: list(r.top_searches, (x) => ({
      query: String(x.query ?? ""),
      count: n(x.count),
      zeroResults: n(x.max_results) === 0,
    })),
    homeScroll: list(r.home_scroll, (x) => ({ depth: n(x.depth), share: ratio(n(x.sessions), n(r.home_sessions)) })),
  };
};
