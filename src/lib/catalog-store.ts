/**
 * Catalog helpers — products & categories (pure, client-safe).
 *
 * Pure list helpers shared by the admin editors; catalog rows themselves
 * live in the database (see use-catalog.ts and /api/admin/products).
 */

import type { Category, Product } from "./catalog";

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Display stock for catalog rows that predate explicit counts
 * (rows carry inStock/lowStock flags but not always a number).
 */
export const displayStock = (p: {
  stock?: number;
  inStock: boolean;
  lowStock?: boolean;
}): number => p.stock ?? (p.inStock ? (p.lowStock ? 3 : 12) : 0);

export const slugify = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

export const cloneProduct = (p: Product): Product => ({
  ...p,
  colors: [...p.colors],
  sizes: [...p.sizes],
  media: p.media.map((m) => ({ ...m })),
  details: p.details.map((d) => ({ ...d })),
  description: [...p.description],
});

export const cloneCategory = (c: Category): Category => ({
  ...c,
  subCategories: [...c.subCategories],
});

export const nextProductId = (list: Product[]): string => {
  const max = list.reduce((m, p) => {
    const n = Number(p.id.replace(/^\D+/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `p${max + 1}`;
};

export const upsertProduct = (
  list: Product[],
  product: Product,
): Product[] => {
  const i = list.findIndex((p) => p.id === product.id);
  if (i === -1) return [...list, cloneProduct(product)];
  const next = [...list];
  next[i] = cloneProduct(product);
  return next;
};

export const setProductFlag = (
  list: Product[],
  id: string,
  flag: "featured" | "isNew",
  value: boolean,
): Product[] =>
  list.map((p) => (p.id === id ? { ...p, [flag]: value } : p));

export const setProductActive = (
  list: Product[],
  id: string,
  active: boolean,
): Product[] =>
  list.map((p) => (p.id === id ? { ...p, active } : p));

export const upsertCategory = (
  list: Category[],
  category: Category,
): Category[] => {
  const i = list.findIndex((c) => c.id === category.id);
  if (i === -1) return [...list, cloneCategory(category)];
  const next = [...list];
  next[i] = cloneCategory(category);
  return next;
};

export const setCategoryActive = (
  list: Category[],
  id: string,
  active: boolean,
): Category[] =>
  list.map((c) => (c.id === id ? { ...c, active } : c));

export const moveCategory = (
  list: Category[],
  id: string,
  dir: -1 | 1,
): Category[] => {
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
