/**
 * Admin catalog store — products & categories (demo, browser-local).
 *
 * Pure helpers at the top (unit-testable); the external store below feeds
 * useSyncExternalStore so admin pages hydrate safely. Seed data comes from
 * src/lib/catalog.ts; edits persist under one localStorage key and are
 * overlaid on top of the seeds. The Supabase phase replaces persistence,
 * not the store API the UI already speaks.
 */

import { CATEGORIES, PRODUCTS, type Category, type Product } from "./catalog";

export const CATALOG_STORAGE_KEY = "prosanti.admin.catalog.v1";

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Clean URL/emoji-safe slug (§52) — keeps Bengali letters. */
/**
 * Display stock for catalog rows that predate explicit counts
 * (seeds carry inStock/lowStock flags but not always a number).
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

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let productsCache: Product[] | null = null;
let categoriesCache: Category[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const seedProducts = (): Product[] => PRODUCTS.map(cloneProduct);
const seedCategories = (): Category[] => CATEGORIES.map(cloneCategory);

const ensureLoaded = (): { products: Product[]; categories: Category[] } => {
  if (loaded && productsCache && categoriesCache) {
    return { products: productsCache, categories: categoriesCache };
  }
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          products?: Product[];
          categories?: Category[];
        };
        if (Array.isArray(parsed.products) && parsed.products.length > 0) {
          productsCache = parsed.products;
        }
        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          categoriesCache = parsed.categories;
        }
      }
    } catch {
      // corrupted storage → fall back to seeds
    }
  }
  productsCache ??= seedProducts();
  categoriesCache ??= seedCategories();
  return { products: productsCache, categories: categoriesCache };
};

const persist = (products: Product[], categories: Category[]) => {
  productsCache = products;
  categoriesCache = categories;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        CATALOG_STORAGE_KEY,
        JSON.stringify({ products, categories }),
      );
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

/* Public store API — components never touch cache directly. */

export const subscribeCatalog = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCatalog = (): { products: Product[]; categories: Category[] } =>
  ensureLoaded();

export const saveProductInStore = (product: Product) => {
  const { products, categories } = ensureLoaded();
  persist(upsertProduct(products, product), categories);
};

export const toggleProductFlagInStore = (
  id: string,
  flag: "featured" | "isNew",
  value: boolean,
) => {
  const { products, categories } = ensureLoaded();
  persist(setProductFlag(products, id, flag, value), categories);
};

export const setProductActiveInStore = (id: string, active: boolean) => {
  const { products, categories } = ensureLoaded();
  persist(setProductActive(products, id, active), categories);
};

export const saveCategoryInStore = (category: Category) => {
  const { products, categories } = ensureLoaded();
  persist(products, upsertCategory(categories, category));
};

export const setCategoryActiveInStore = (id: string, active: boolean) => {
  const { products, categories } = ensureLoaded();
  persist(products, setCategoryActive(categories, id, active));
};

export const moveCategoryInStore = (id: string, dir: -1 | 1) => {
  const { products, categories } = ensureLoaded();
  persist(products, moveCategory(categories, id, dir));
};

export const resetCatalogStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CATALOG_STORAGE_KEY);
  }
  persist(seedProducts(), seedCategories());
};
