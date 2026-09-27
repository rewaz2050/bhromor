/**
 * Shop listing URL state (UX plan §3, R4) — pure, server-safe.
 *
 * Every filter the shopper can set on /shop lives in the query string, so:
 *   • the page can be shared / bookmarked exactly as it looks,
 *   • Back from a product page lands on the same list (the server page
 *     reads the same params it wrote), and
 *   • nothing is lost on reload.
 *
 * `?category=men&sub=Panjabi&filter=sale|new&q=…&mood=…&price=…&sort=…
 *  &size=M,L&color=Ivory&stock=1` — defaults are omitted, unknown params
 * (utm_*, fbclid…) are left alone.
 */

import type { SortKey } from "./shop-sort";

/** Price bands — keys are URL values; bounds in taka (inclusive min, exclusive max). */
export const PRICE_BAND_DEFS: { key: PriceBandKey; min?: number; max?: number }[] = [
  { key: "any" },
  { key: "under500", max: 500 },
  { key: "under1000", max: 1000 },
  { key: "1000-1500", min: 1000, max: 1500 },
  { key: "1500-2500", min: 1500, max: 2500 },
  { key: "above2500", min: 2500 },
];
export type PriceBandKey = "any" | "under500" | "under1000" | "1000-1500" | "1500-2500" | "above2500";
export const PRICE_BAND_KEYS: readonly PriceBandKey[] = PRICE_BAND_DEFS.map((b) => b.key);

/** `?price=` → a known band, else "any". */
export const resolvePriceBand = (raw: string | string[] | undefined): PriceBandKey => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PRICE_BAND_KEYS as readonly string[]).includes(v ?? "") ? (v as PriceBandKey) : "any";
};

/** Is `price` (paisa) inside the band? */
export const inPriceBand = (price: number, key: string): boolean => {
  const band = PRICE_BAND_DEFS.find((b) => b.key === key);
  if (!band || band.key === "any") return true;
  if (band.min !== undefined && price < band.min * 100) return false;
  if (band.max !== undefined && price >= band.max * 100) return false;
  return true;
};

const LIST_MAX_ITEMS = 8;
const LIST_MAX_LEN = 40;

/** `?size=M,L` → ["M", "L"] — trimmed, de-duplicated, capped. */
export const parseList = (raw: string | string[] | undefined): string[] => {
  const v = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const out: string[] = [];
  for (const part of v.split(",")) {
    const item = part.trim().slice(0, LIST_MAX_LEN);
    if (item && !out.includes(item)) out.push(item);
    if (out.length >= LIST_MAX_ITEMS) break;
  }
  return out;
};

export interface ShopUrlState {
  category: string; // "all" = none
  sub: string;
  onlyNew: boolean;
  onlySale: boolean;
  q: string;
  mood: string;
  price: string;
  sort: SortKey;
  sizes: string[];
  colors: string[];
  inStock: boolean;
}

/** The params this module owns (everything else in the URL is preserved). */
export const SHOP_URL_KEYS = ["category", "sub", "filter", "q", "mood", "price", "sort", "size", "color", "stock"] as const;

/**
 * Build the search string for a filter state, keeping any foreign params
 * from `currentSearch`. Returns "" (no "?") when nothing is set.
 */
export const shopSearchString = (state: ShopUrlState, currentSearch = ""): string => {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  for (const key of SHOP_URL_KEYS) params.delete(key);
  const set = (key: string, value: string) => {
    if (value) params.set(key, value);
  };
  set("category", state.category !== "all" ? state.category : "");
  set("sub", state.category !== "all" ? state.sub.trim() : "");
  set("filter", state.onlySale ? "sale" : state.onlyNew ? "new" : "");
  set("q", state.q.trim());
  set("mood", state.mood);
  set("price", state.price !== "any" ? state.price : "");
  set("sort", state.sort !== "featured" ? state.sort : "");
  set("size", state.sizes.join(","));
  set("color", state.colors.join(","));
  set("stock", state.inStock ? "1" : "");
  const s = params.toString();
  return s ? `?${s}` : "";
};

/** History-state key under which the listing remembers its scroll offset. */
export const SHOP_SCROLL_KEY = "psShopScroll";
