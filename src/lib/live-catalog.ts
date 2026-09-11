/**
 * Live catalog registry — the bridge between sync UI code and the async
 * backend. The launch catalog paints first (SSR-safe reference — the same
 * rows scripts/seed-supabase.mjs writes); when /api/products answers `live`,
 * the registry swaps in database rows (uuid ids, live prices/stock) and every
 * subscriber re-renders.
 *
 * IMPORTANT: in live mode product ids are database uuids, not p1…p7.
 * Anything stored by id (cart, wishlist) resolves through here — legacy
 * launch-seed ids bridge to their live row via the launch-catalog slug, so a
 * cart built before the database was seeded survives the cutover at LIVE
 * prices. Anything that matches neither simply stops matching — quiet, never
 * a crash.
 */

import {
  CATEGORIES,
  PRODUCTS,
  type Category,
  type DeliveryZone,
  type Product,
  type Shop,
} from "./catalog";

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => {
  for (const l of listeners) l();
};

export const subscribeLiveCatalog = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let liveProducts: Product[] | null = null;
let liveCategories: Category[] | null = null;
let liveZones: DeliveryZone[] | null = null;
let liveShops: Shop[] | null = null;
let catalogSettled = false;
let zonesSettled = false;
let catalogPromise: Promise<boolean> | null = null;
let zonesPromise: Promise<boolean> | null = null;

export const getLiveProducts = (): Product[] | null => liveProducts;
export const getLiveCategories = (): Category[] | null => liveCategories;
export const getLiveZones = (): DeliveryZone[] | null => liveZones;
export const getLiveShops = (): Shop[] | null => liveShops;
export const isCatalogSettled = (): boolean => catalogSettled;
export const isZonesSettled = (): boolean => zonesSettled;

/**
 * Snapshot getters with stable references for useSyncExternalStore. Shops are
 * live-only (no fake shop seeds): until the database answers, shops are empty
 * and shop-scoped surfaces show their empty state. Products/categories/zones
 * keep the launch catalog as the reference list until live rows arrive.
 */
export const getProductsSnapshot = (): Product[] => liveProducts ?? PRODUCTS;
export const getCategoriesSnapshot = (): Category[] => liveCategories ?? CATEGORIES;
export const getZonesSnapshot = (): DeliveryZone[] => liveZones ?? EMPTY_ZONES;
/** Stable empty references so useSyncExternalStore never re-renders on a
 *  fresh `[]` per call while the backend has not answered. */
const EMPTY_ZONES: DeliveryZone[] = [];
const EMPTY_SHOPS: Shop[] = [];

export const getShopsSnapshot = (): Shop[] => liveShops ?? EMPTY_SHOPS;

/**
 * Id resolution against the SERVING catalog. Once live rows arrive, legacy
 * launch-seed ids (p1…p7) bridge through their launch-catalog slug to the
 * seeded row's uuid — so carts that were built while the store was unseeded
 * survive the cutover (including the checkout auto-seed moment) instead of
 * silently emptying. Entries that match neither stop matching quietly.
 */
export const resolveCatalogProduct = (id: string): Product | undefined => {
  const pool = liveProducts ?? PRODUCTS;
  const direct = pool.find((p) => p.id === id);
  if (direct) return direct;
  if (liveProducts) {
    const seed = PRODUCTS.find((p) => p.id === id);
    if (seed) return liveProducts.find((p) => p.slug === seed.slug);
  }
  return undefined;
};

export const resolveCatalogCategory = (id: string): Category | undefined =>
  (liveCategories ?? CATEGORIES).find((c) => c.id === id);

/**
 * Fetch-once live catalog. Returns true when live rows are serving.
 * Failures are silent by design — surfaces keep their empty state.
 */
export const ensureLiveCatalog = (): Promise<boolean> => {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        source?: string;
        products?: Product[];
        categories?: Category[];
        shops?: Shop[];
      };
      if (
        data.source === "live" &&
        Array.isArray(data.products) &&
        data.products.length > 0
      ) {
        liveProducts = data.products;
        liveCategories = Array.isArray(data.categories)
          ? data.categories
          : CATEGORIES;
        liveShops = Array.isArray(data.shops) ? data.shops : [];
        notify();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      catalogSettled = true;
    }
  })();
  return catalogPromise;
};

/** Fetch-once live zones for checkout + the delivery checker. */
export const ensureLiveZones = (): Promise<boolean> => {
  if (zonesPromise) return zonesPromise;
  zonesPromise = (async () => {
    try {
      const res = await fetch("/api/zones", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        zones?: DeliveryZone[];
      };
      if (Array.isArray(data.zones) && data.zones.length > 0) {
        liveZones = data.zones;
        notify();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      zonesSettled = true;
    }
  })();
  return zonesPromise;
};

/** Test-only reset. */
export const __resetLiveCatalog = (): void => {
  liveProducts = null;
  liveCategories = null;
  liveZones = null;
  liveShops = null;
  catalogSettled = false;
  zonesSettled = false;
  catalogPromise = null;
  zonesPromise = null;
};
