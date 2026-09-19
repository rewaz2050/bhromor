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
