/**
 * Per-size availability (UX plan §4, R10) — pure helpers shared by the
 * product page, the card quick-add sheet and the sticky buy bar.
 *
 * The honest rule: a size is "sold out" only when the live variant grid SAYS
 * zero. Seeds and products without a grid have no `sizeStock`, and an
 * unknown size counts as available — we never grey a chip on a guess.
 */

import type { Product } from "./catalog";
import { bnDigits } from "./arrival";

/** "N left" is whispered at this count or below (never for zero). */
export const SIZE_LOW_MAX = 3;

export type SizeState = "unknown" | "out" | "low" | "ok";

export interface SizeAvailability {
  state: SizeState;
  /** Units available, or null when the grid does not know this size. */
  available: number | null;
}

export const sizeAvailability = (product: Product, size: string): SizeAvailability => {
  const grid = product.sizeStock;
  if (!grid || !(size in grid)) return { state: "unknown", available: null };
  const n = Math.max(0, Math.floor(grid[size] ?? 0));
  if (n === 0) return { state: "out", available: 0 };
  if (n <= SIZE_LOW_MAX) return { state: "low", available: n };
  return { state: "ok", available: n };
};

export const isSizeSoldOut = (product: Product, size: string): boolean =>
  sizeAvailability(product, size).state === "out";

/** Sizes the shopper can actually buy right now, in catalogue order. */
export const availableSizes = (product: Product): string[] =>
  product.sizes.filter((s) => !isSizeSoldOut(product, s));

/**
 * The size to pre-select: the preferred one if it can be bought, otherwise
 * nothing (a silent switch to a size the shopper did not ask for is worse
 * than asking). `null` preferred → the only size when there is one.
 */
export const pickSelectableSize = (product: Product, preferred: string | null | undefined): string => {
  if (preferred && product.sizes.includes(preferred) && !isSizeSoldOut(product, preferred)) return preferred;
  if (!preferred && product.sizes.length === 1 && !isSizeSoldOut(product, product.sizes[0])) return product.sizes[0];
  return "";
};

/** "২টি বাকি" / "2 left" — only for the low band. */
export const sizeLeftLabel = (available: number, lang: "en" | "bn"): string =>
  lang === "bn" ? `${bnDigits(String(available))}টি বাকি` : `${available} left`;
