/**
 * Shop sort keys — shared by the server page (parsing `?sort=`) and the
 * client browser. Kept out of the "use client" module so the server page can
 * call `resolveSort()` (a client-module export cannot be invoked from the
 * server; Next throws "Attempted to call resolveSort() from the server").
 */
export type SortKey = "featured" | "newest" | "best" | "price-asc" | "price-desc";

export const SORT_KEYS: readonly SortKey[] = [
  "featured",
  "newest",
  "best",
  "price-asc",
  "price-desc",
];

/** `?sort=` from a link → a known sort key, else the default. */
export const resolveSort = (raw: string | string[] | undefined): SortKey => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (SORT_KEYS as readonly string[]).includes(v ?? "") ? (v as SortKey) : "featured";
};

/** The fields a sort needs — `Product` satisfies it; tests can pass less. */
export interface Sortable {
  isNew?: boolean;
  unitsSold?: number | null;
  price: number;
  inStock: boolean;
  featured?: boolean;
}

/**
 * The one sort used by every shelf (the shop browser, a shop's own page —
 * UX plan §9, R11). `index` is the merchandising order the list arrived in,
 * the tie-breaker everywhere.
 *   featured  — in stock first, then featured, then merchandising order
 *   newest    — new pieces first, latest first
 *   best      — real sales (v_product_sales); rows without a figure last
 *   price-*   — by price, ties in merchandising order
 */
export const sortShelf = <P extends Sortable>(products: readonly P[], sort: SortKey): P[] => {
  const indexed = products.map((p, index) => ({ p, index }));
  switch (sort) {
    case "newest":
      indexed.sort((a, b) => Number(!!b.p.isNew) - Number(!!a.p.isNew) || b.index - a.index);
      break;
    case "best":
      indexed.sort((a, b) => (b.p.unitsSold ?? -1) - (a.p.unitsSold ?? -1) || a.index - b.index);
      break;
    case "price-asc":
      indexed.sort((a, b) => a.p.price - b.p.price || a.index - b.index);
      break;
    case "price-desc":
      indexed.sort((a, b) => b.p.price - a.p.price || a.index - b.index);
      break;
    default:
      indexed.sort(
        (a, b) =>
          Number(b.p.inStock) - Number(a.p.inStock) ||
          Number(!!b.p.featured) - Number(!!a.p.featured) ||
          a.index - b.index,
      );
  }
  return indexed.map(({ p }) => p);
};
