/**
 * Category menu entries (menubar redesign, 2026-09-26) — the data behind
 * the desktop "Categories" drop-down and the mobile drawer's category list.
 *
 * Pure and client-safe. Only active categories that actually have at least
 * one discoverable piece appear (a dead entry is worse than no entry), in the
 * catalog's own order; each carries its piece count and the garment types
 * inside it — the shop's declared order first, then anything else the
 * products carry, by count — with the same `/shop?category=…&sub=…` links
 * the shop browser understands.
 */

import type { Category, Product } from "./catalog";
import { isDiscoverable } from "./merchandising";

export interface CategoryMenuSub {
  name: string;
  count: number;
  href: string;
}

export interface CategoryMenuEntry {
  category: Category;
  /** Discoverable pieces in this category. */
  count: number;
  /** `/shop?category=<id>` */
  href: string;
  /** Garment types with at least one piece (never more than `maxSubs`). */
  subCategories: CategoryMenuSub[];
}

export const categoryHref = (id: string): string =>
  `/shop?category=${encodeURIComponent(id)}`;

export const subCategoryHref = (id: string, sub: string): string =>
  `${categoryHref(id)}&sub=${encodeURIComponent(sub)}`;

export const categoryMenuEntries = (
  products: Product[],
  categories: Category[],
  maxSubs = 6,
): CategoryMenuEntry[] => {
  const visible = products.filter(isDiscoverable);
  const entries: CategoryMenuEntry[] = [];
  for (const category of categories) {
    if (category.active === false) continue;
    const mine = visible.filter((p) => p.category === category.id);
    if (mine.length === 0) continue;

    const counts = new Map<string, number>();
    for (const p of mine) {
      const key = (p.subCategory ?? "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const declared = category.subCategories ?? [];
    const ordered = [
      ...declared.filter((name) => counts.has(name)),
      ...Array.from(counts.keys())
        .filter((name) => !declared.includes(name))
        .sort(
          (a, b) =>
            (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
        ),
    ];

    entries.push({
      category,
      count: mine.length,
      href: categoryHref(category.id),
      subCategories: ordered.slice(0, maxSubs).map((name) => ({
        name,
        count: counts.get(name) ?? 0,
        href: subCategoryHref(category.id, name),
      })),
    });
  }
  return entries;
};
