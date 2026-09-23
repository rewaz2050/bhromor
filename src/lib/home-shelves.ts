/**
 * Homepage shelves (Batch J, 2026-09-19; reordered 2026-09-20) — pure
 * helpers, client-safe.
 *
 * The storefront homepage stopped being a poster: after a compact hero the
 * shopper sees the category row, the offers, and then the WHOLE shelf,
 * category by category. The curated pickers (best sellers / new arrivals)
 * come from real data — `unitsSold` (v_product_sales) and the catalog's
 * newest-first order — and still power the sorted shop links.
 *
 * Everything here is deterministic and order-stable so the server HTML and
 * the client hydration agree, and so tests can pin the exact sequence.
 */

import type { Category, Product } from "./catalog";
import { isDiscoverable, isOnOffer, offerPct } from "./merchandising";

/** One category block on the homepage: heading + its pieces in shelf order. */
export interface CategoryShelf {
  category: Category;
  /** Every discoverable piece in this category (in-stock first). */
  products: Product[];
  /** How many more sit behind "See all" — 0 when the block shows them all. */
  hiddenCount: number;
  /** The `/shop?category=` link the heading and the "See all" chip share. */
  href: string;
}

/** Default cap per category block on the homepage (2 rows of 4 on desktop). */
export const SHELF_PREVIEW = 8;
/** Default length of the best-seller / new-arrival rails. */
export const RAIL_LENGTH = 8;

/**
 * In-stock pieces first, then everything else, original order preserved
 * inside each half. A sold-out piece never opens a shelf.
 */
export const inStockFirst = (list: Product[]): Product[] => {
  const live: Product[] = [];
  const out: Product[] = [];
  for (const p of list) (p.inStock ? live : out).push(p);
  return live.concat(out);
};

/**
 * Build the category blocks. Only active categories that actually have at
 * least one discoverable piece appear; category order follows `categories`
 * (the DB's sort_order), pieces follow the catalog's order (newest first on
 * live rows) with sold-out pieces pushed to the back of each block.
 */
export const categoryShelves = (
  products: Product[],
  categories: Category[],
  limit = SHELF_PREVIEW,
): CategoryShelf[] => {
  const visible = products.filter(isDiscoverable);
  const shelves: CategoryShelf[] = [];
  for (const category of categories) {
    if (category.active === false) continue;
    const mine = inStockFirst(visible.filter((p) => p.category === category.id));
    if (mine.length === 0) continue;
    shelves.push({
      category,
      products: limit > 0 ? mine.slice(0, limit) : mine,
      hiddenCount: limit > 0 ? Math.max(0, mine.length - limit) : 0,
      href: `/shop?category=${encodeURIComponent(category.id)}`,
    });
  }
  return shelves;
};

/**
 * Best sellers = highest real `unitsSold` first (ties keep catalog order),
 * in stock only. Pieces without a sales figure never qualify — a rail that
 * needs at least `min` real sellers stays hidden until the shop has them,
 * instead of dressing up guesses as "best".
 */
export const bestSellers = (
  products: Product[],
  limit = RAIL_LENGTH,
  min = 2,
): Product[] => {
  const ranked = products
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => isDiscoverable(p) && p.inStock && (p.unitsSold ?? 0) > 0)
    .sort((a, b) => (b.p.unitsSold ?? 0) - (a.p.unitsSold ?? 0) || a.index - b.index)
    .map(({ p }) => p);
  return ranked.length >= min ? ranked.slice(0, limit) : [];
};

/**
 * New arrivals = pieces flagged `isNew` first, then the newest rows by
 * catalog order (live rows arrive newest-first from the database). In stock
 * only; never empty while the shop has anything to sell.
 */
export const newArrivals = (products: Product[], limit = RAIL_LENGTH): Product[] => {
  const live = products.filter((p) => isDiscoverable(p) && p.inStock);
  const flagged = live.filter((p) => p.isNew);
  const rest = live.filter((p) => !p.isNew);
  return flagged.concat(rest).slice(0, limit);
};

/**
 * Offers = discoverable pieces whose list price is struck through
 * (`compareAtPrice` above `price`), biggest saving first — ties keep the
 * catalog order — with sold-out pieces at the back. The flash drop is a
 * separate rail with its own countdown (components/promo/flash-rail).
 */
export const offerProducts = (products: Product[], limit = RAIL_LENGTH): Product[] => {
  const ranked = products
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => isDiscoverable(p) && isOnOffer(p))
    .sort((a, b) => offerPct(b.p) - offerPct(a.p) || a.index - b.index)
    .map(({ p }) => p);
  const list = inStockFirst(ranked);
  return limit > 0 ? list.slice(0, limit) : list;
};

/** How many discoverable pieces are on offer — the "See all N offers" count. */
export const offerCount = (products: Product[]): number =>
  products.filter((p) => isDiscoverable(p) && isOnOffer(p)).length;

/**
 * Product page tail — "More in <category>" (2026-09-20: strictly the same
 * category). The shopper opened a panjabi, so the shelf at the foot of the
 * page is panjabis: siblings from the SAME category, in stock first, never
 * the current piece, never a piece already shown in "complete the look".
 * Nothing from other categories tops the row up — an empty result means the
 * section stays away rather than dressing strangers up as siblings.
 */
export const moreInCategory = (
  product: Pick<Product, "id" | "category">,
  products: Product[],
  exclude: readonly Pick<Product, "id">[] = [],
  limit = 8,
): { items: Product[]; hiddenCount: number; total: number } => {
  const skip = new Set<string>([product.id, ...exclude.map((e) => e.id)]);
  const category = products.filter(
    (p) => isDiscoverable(p) && p.category === product.category,
  );
  const siblings = inStockFirst(category.filter((p) => !skip.has(p.id)));
  const items = limit > 0 ? siblings.slice(0, limit) : siblings;
  return {
    items,
    hiddenCount: siblings.length - items.length,
    // Every discoverable piece in the category (the current one included) —
    // the number the scoped shop link actually lists.
    total: category.length,
  };
};

/** Bangla-aware display name for a category. */
export const categoryLabel = (category: Category, lang: "en" | "bn"): string =>
  lang === "bn" && category.nameBn ? category.nameBn : category.name;
