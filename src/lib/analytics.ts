/**
 * Storefront analytics — Meta Pixel + GA4, both optional.
 *
 * Set NEXT_PUBLIC_META_PIXEL_ID and/or NEXT_PUBLIC_GA4_ID and the tags load
 * after the page is interactive; leave them blank and NOTHING is loaded —
 * no script, no request, no cookie. Every event goes through `track()`
 * below, which maps one storefront event onto both vendors' names, so a
 * component never talks to `fbq`/`gtag` directly.
 *
 * Money: the storefront keeps paisa (§69); analytics vendors want major
 * units, so `taka()` converts once here. Only the funnel is tracked
 * (view → add to bag → checkout → purchase); no personal data is sent
 * (no phone, no address, no name).
 */

import type { Product } from "./catalog";
import { currentLang, record } from "./events-sink";
import type { WireEvent } from "./funnel-events";

export const CURRENCY = "BDT";

const nonEmpty = (v: string | undefined): string | null => {
  const t = v?.trim() ?? "";
  return t === "" ? null : t;
};

/** Meta Pixel id — digits only, or null when unset/malformed. */
export const metaPixelId = (): string | null => {
  const id = nonEmpty(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  return id && /^\d{6,20}$/.test(id) ? id : null;
};

/** GA4 measurement id — "G-XXXXXXX", or null when unset/malformed. */
export const ga4Id = (): string | null => {
  const id = nonEmpty(process.env.NEXT_PUBLIC_GA4_ID);
  return id && /^G-[A-Z0-9]{4,16}$/i.test(id) ? id.toUpperCase() : null;
};

export const analyticsEnabled = (): boolean => metaPixelId() !== null || ga4Id() !== null;

export const taka = (paisa: number): number => Math.round(paisa) / 100;

export interface AnalyticsItem {
  id: string;
  name: string;
  category?: string;
  /** Paisa. */
  price: number;
  qty: number;
  /** Owning shop (marketplace) — for the shop-wise funnel; never sent to vendors. */
  shopId?: string;
}

export const itemFromProduct = (product: Product, qty = 1): AnalyticsItem => ({
  id: product.id,
  name: product.name,
  category: product.category,
  price: product.price,
  qty,
  shopId: product.shopId,
});

export type FunnelEvent =
  | { type: "page_view"; path: string }
  | { type: "view_item"; item: AnalyticsItem }
  /** `source`: where the add came from — 'card' | 'pdp' | 'bundle' | 'live' | a rail name. */
  | { type: "add_to_cart"; item: AnalyticsItem; source?: string }
  | { type: "begin_checkout"; items: AnalyticsItem[]; value: number }
  | { type: "purchase"; orderId: string; items: AnalyticsItem[]; value: number; delivery: number }
  /** `results`: how many products the shopper saw for the query. */
  | { type: "search"; query: string; results?: number }
  /** UX plan §0 — a rail / grid was shown (`list` names it). */
  | { type: "view_item_list"; list: string; count: number }
  /** UX plan §0 — a product was tapped from a list. */
  | { type: "select_item"; item: AnalyticsItem; list: string }
  /** UX plan §0 — the shopper scrolled past `depth` % of `path`. */
  | { type: "scroll_depth"; path: string; depth: number };

/**
 * The first-party copy of one event (`POST /api/events`) — short keys, no
 * personal data. Pure so it can be asserted in tests.
 */
export const wireEvent = (ev: FunnelEvent, path?: string): WireEvent => {
  const base: WireEvent = { t: ev.type };
  if (path) base.p = path;
  switch (ev.type) {
    case "page_view":
      return { ...base, p: ev.path.split(/[?#]/)[0] };
    case "view_item":
      return { ...base, pid: ev.item.id, shop: ev.item.shopId, v: ev.item.price };
    case "add_to_cart":
      return { ...base, pid: ev.item.id, shop: ev.item.shopId, src: ev.source, v: ev.item.price * ev.item.qty };
    case "begin_checkout":
      return { ...base, v: ev.value, meta: { items: ev.items.reduce((n, i) => n + i.qty, 0) } };
    case "purchase":
      return {
        ...base,
        v: ev.value,
        shop: ev.items[0]?.shopId,
        meta: { items: ev.items.reduce((n, i) => n + i.qty, 0), delivery: ev.delivery },
      };
    case "search":
      return { ...base, v: ev.results, meta: { q: ev.query.trim().slice(0, 80).toLowerCase() } };
    case "view_item_list":
      return { ...base, src: ev.list, v: ev.count };
    case "select_item":
      return { ...base, pid: ev.item.id, shop: ev.item.shopId, src: ev.list };
    case "scroll_depth":
      return { ...base, p: ev.path.split(/[?#]/)[0], v: ev.depth };
  }
};

type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;

const fbq = (): Fbq | null =>
  typeof window !== "undefined" && typeof (window as { fbq?: unknown }).fbq === "function"
    ? ((window as unknown as { fbq: Fbq }).fbq)
    : null;
const gtag = (): Gtag | null =>
  typeof window !== "undefined" && typeof (window as { gtag?: unknown }).gtag === "function"
    ? ((window as unknown as { gtag: Gtag }).gtag)
    : null;

const gaItems = (items: AnalyticsItem[]) =>
  items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    item_category: i.category,
    price: taka(i.price),
    quantity: i.qty,
  }));

const metaContents = (items: AnalyticsItem[]) =>
  items.map((i) => ({ id: i.id, quantity: i.qty, item_price: taka(i.price) }));

/**
 * The vendor payloads for one funnel event — pure, so the mapping is
 * testable without a window. `null` means the vendor gets nothing.
 */
export const vendorPayloads = (
  ev: FunnelEvent,
): { meta: [string, Record<string, unknown>?] | null; ga: [string, Record<string, unknown>?] | null } => {
  switch (ev.type) {
    case "page_view":
      return { meta: ["PageView"], ga: ["page_view", { page_path: ev.path }] };
    case "view_item":
      return {
        meta: [
          "ViewContent",
          {
            content_ids: [ev.item.id],
            content_name: ev.item.name,
            content_type: "product",
            value: taka(ev.item.price),
            currency: CURRENCY,
          },
        ],
        ga: ["view_item", { currency: CURRENCY, value: taka(ev.item.price), items: gaItems([ev.item]) }],
      };
    case "add_to_cart":
      return {
        meta: [
          "AddToCart",
          {
            content_ids: [ev.item.id],
            content_name: ev.item.name,
            content_type: "product",
            value: taka(ev.item.price * ev.item.qty),
            currency: CURRENCY,
          },
        ],
        ga: [
          "add_to_cart",
          { currency: CURRENCY, value: taka(ev.item.price * ev.item.qty), items: gaItems([ev.item]) },
        ],
      };
    case "begin_checkout":
      return {
        meta: [
          "InitiateCheckout",
          {
            content_ids: ev.items.map((i) => i.id),
            contents: metaContents(ev.items),
            num_items: ev.items.reduce((n, i) => n + i.qty, 0),
            value: taka(ev.value),
            currency: CURRENCY,
          },
        ],
        ga: ["begin_checkout", { currency: CURRENCY, value: taka(ev.value), items: gaItems(ev.items) }],
      };
    case "purchase":
      return {
        meta: [
          "Purchase",
          {
            content_ids: ev.items.map((i) => i.id),
            contents: metaContents(ev.items),
            content_type: "product",
            num_items: ev.items.reduce((n, i) => n + i.qty, 0),
            value: taka(ev.value),
            currency: CURRENCY,
          },
        ],
        ga: [
          "purchase",
          {
            transaction_id: ev.orderId,
            currency: CURRENCY,
            value: taka(ev.value),
            shipping: taka(ev.delivery),
            items: gaItems(ev.items),
          },
        ],
      };
    case "search":
      return {
        meta: ["Search", { search_string: ev.query }],
        ga: ["search", { search_term: ev.query }],
      };
    case "view_item_list":
      return { meta: null, ga: ["view_item_list", { item_list_name: ev.list }] };
    case "select_item":
      return { meta: null, ga: ["select_item", { item_list_name: ev.list, items: gaItems([ev.item]) }] };
    case "scroll_depth":
      return { meta: null, ga: ["scroll", { percent_scrolled: ev.depth, page_path: ev.path }] };
  }
};

/**
 * Fire one funnel event: the shop's own copy always (first-party sink →
 * Admin → Reports), then whichever vendors are loaded. Never throws.
 */
export const track = (ev: FunnelEvent): void => {
  try {
    if (typeof window !== "undefined") {
      const path = window.location?.pathname;
      const wire = wireEvent(ev, path);
      const lang = currentLang();
      record(lang ? { ...wire, lang } : wire);
    }
  } catch {
    /* the shop's own sink must be as harmless as the vendors' */
  }
  const { meta, ga } = vendorPayloads(ev);
  try {
    const f = fbq();
    if (f && meta) f("track", ...meta);
  } catch {
    /* a blocked/misbehaving tag must never break the shop */
  }
  try {
    const g = gtag();
    if (g && ga) g("event", ...ga);
  } catch {
    /* ditto */
  }
};

/**
 * Purchases must be counted once even if the receipt re-renders or the
 * shopper reloads it. The last counted order id is kept per session.
 */
const PURCHASE_KEY = "prosanti.analytics.purchase.v1";
export const trackPurchaseOnce = (ev: Extract<FunnelEvent, { type: "purchase" }>): boolean => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage.getItem(PURCHASE_KEY) === ev.orderId) {
      return false;
    }
    window.sessionStorage.setItem(PURCHASE_KEY, ev.orderId);
  } catch {
    /* storage blocked — count it anyway */
  }
  track(ev);
  return true;
};
