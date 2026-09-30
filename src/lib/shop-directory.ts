/**
 * /shops directory: search, sort and filters (2026-09-28 — item A1 of
 * docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Why this is a pure module: the directory already had the data (shops,
 * products, categories, the visitor's zone) and only the zone reorder; the
 * moment there are twenty shops a shopper cannot find one. Everything here
 * is deterministic and testable — the component only renders the answer.
 *
 * Honesty rules kept from the rest of the storefront:
 *   • a shop with no reviews never outranks a reviewed one on "Top rated"
 *     (0 reviews is not a 0-star rating — it is no answer);
 *   • a category chip appears only when a shop actually stocks it;
 *   • "Delivers to my area" hides shops and says how many, never silently.
 */

import type { Category, Product, Shop } from "./catalog";
import { productShopId, shopServesZone } from "./shop-utils";

export type ShopSort = "recommended" | "rating" | "shelf" | "name";

/** Sort options in the order the UI shows them. */
export const SHOP_SORTS: ShopSort[] = ["recommended", "rating", "shelf", "name"];

export interface ShopDirectoryFilters {
  /** Free text over the shop name and tagline (all tokens must match). */
  q: string;
  sort: ShopSort;
  /** Category id, or null for "all". */
  categoryId: string | null;
  /** The visitor's picked zone, or null when none is picked yet. */
  zoneId: string | null;
  /** Hide shops that do not serve `zoneId` (only meaningful with a zone). */
  onlyServingZone: boolean;
}

export const EMPTY_SHOP_FILTERS: ShopDirectoryFilters = {
  q: "",
  sort: "recommended",
  categoryId: null,
  zoneId: null,
  onlyServingZone: false,
};

const normalize = (value: string): string => value.trim().toLowerCase();

/** Name + tagline search. A multi-word query needs every word to appear. */
export const shopMatchesQuery = (shop: Shop, rawQuery: string): boolean => {
  const q = normalize(rawQuery);
  if (!q) return true;
  const hay = normalize(`${shop.name} ${shop.tagline ?? ""}`);
  return q.split(/\s+/).every((token) => hay.includes(token));
};

/**
 * Which categories each shop's shelf actually holds — built from the same
 * catalog rows the storefront already renders (a product without a shopId
 * belongs to the fallback shop, exactly like `productCounts`).
 */
export const shopStockedCategories = (
  products: Product[],
  fallbackShopId: string,
): Record<string, string[]> => {
  const out: Record<string, Set<string>> = {};
  for (const p of products) {
    const id = productShopId(p, fallbackShopId);
    (out[id] ??= new Set()).add(p.category);
  }
  return Object.fromEntries(
    Object.entries(out).map(([shopId, set]) => [shopId, [...set]]),
  );
};

/**
 * The chips to show: only categories some shop stocks, in catalog order.
 * A category id that is stocked but missing from the catalog keeps its raw
 * id (same fallback as the shop shelf's own chips) so nothing is hidden.
 */
export const directoryCategories = (
  categories: Category[],
  categoriesByShop: Record<string, string[]>,
): Category[] => {
  const stocked = new Set(Object.values(categoriesByShop).flat());
  if (stocked.size === 0) return [];
  const known = categories.filter((c) => stocked.has(c.id));
  const unknown = [...stocked].filter((id) => !categories.some((c) => c.id === id));
  return [
    ...known,
    ...unknown.map((id) => ({ id, name: id, nameBn: id, tagline: "", image: "", subCategories: [] })),
  ];
};

const nameCompare = (a: Shop, b: Shop): number =>
  a.name.localeCompare(b.name, "bn", { sensitivity: "base" }) ||
  a.slug.localeCompare(b.slug);

/**
 * Sort the (already filtered) shops. `recommended` keeps the long-standing
 * behaviour — shops that deliver to the visitor's zone float up — and only
 * then prefers reviewed, then bigger shelves.
 */
export const sortShops = (
  shops: Shop[],
  sort: ShopSort,
  productCounts: Record<string, number>,
  zoneId: string | null,
): Shop[] => {
  const count = (s: Shop) => productCounts[s.id] ?? 0;
  return [...shops].sort((a, b) => {
    switch (sort) {
      case "rating": {
        const ar = a.ratingCount > 0 ? a.ratingAvg : -1;
        const br = b.ratingCount > 0 ? b.ratingAvg : -1;
        return br - ar || b.ratingCount - a.ratingCount || nameCompare(a, b);
      }
      case "shelf":
        return count(b) - count(a) || nameCompare(a, b);
      case "name":
        return nameCompare(a, b);
      case "recommended":
      default: {
        if (zoneId) {
          const sa = shopServesZone(a, zoneId) ? 0 : 1;
          const sb = shopServesZone(b, zoneId) ? 0 : 1;
          if (sa !== sb) return sa - sb;
        }
        const ar = a.ratingCount > 0 ? a.ratingAvg : -1;
        const br = b.ratingCount > 0 ? b.ratingAvg : -1;
        return br - ar || count(b) - count(a) || nameCompare(a, b);
      }
    }
  });
};

/**
 * The whole directory answer in one pure call.
 *
 * `hiddenByZone` is the honest count of shops the "my area" toggle removed,
 * so the UI can offer to show them instead of pretending they don't exist.
 */
export const filterShopsForDirectory = (
  shops: Shop[],
  productCounts: Record<string, number>,
  categoriesByShop: Record<string, string[]>,
  filters: ShopDirectoryFilters,
): { shops: Shop[]; hiddenByZone: number } => {
  const matched = shops.filter((shop) => {
    if (!shopMatchesQuery(shop, filters.q)) return false;
    if (filters.categoryId && !(categoriesByShop[shop.id] ?? []).includes(filters.categoryId)) {
      return false;
    }
    return true;
  });
  const zoneActive = filters.onlyServingZone && filters.zoneId !== null;
  const visible = zoneActive
    ? matched.filter((shop) => shopServesZone(shop, filters.zoneId as string))
    : matched;
  return {
    shops: sortShops(visible, filters.sort, productCounts, filters.zoneId),
    hiddenByZone: matched.length - visible.length,
  };
};
