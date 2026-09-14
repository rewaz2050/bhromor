/**
 * Live catalog registry — the bridge between sync UI code and the async
 * backend. NOTHING paints until the database answers: the demo launch
 * catalog is gone from every live surface (storefront, search, bag,
 * stories). Before /api/products serves `live`, the registry is an honest
 * empty state; after, it swaps in database rows and every subscriber
 * re-renders. Surfaces show `loading` until settled, so empty is never
 * mistaken for "no stock".
 */

import {
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
 * Snapshot getters with stable references for useSyncExternalStore.
 * Everything is live-only: until the database answers, each snapshot is a
 * stable EMPTY array — no seeds, no demo rows, never an invented catalog.
 */
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_CATEGORIES: Category[] = [];

export const getProductsSnapshot = (): Product[] => liveProducts ?? EMPTY_PRODUCTS;
export const getCategoriesSnapshot = (): Category[] => liveCategories ?? EMPTY_CATEGORIES;
export const getZonesSnapshot = (): DeliveryZone[] => liveZones ?? EMPTY_ZONES;
/** Stable empty references so useSyncExternalStore never re-renders on a
 *  fresh `[]` per call while the backend has not answered. */
const EMPTY_ZONES: DeliveryZone[] = [];
const EMPTY_SHOPS: Shop[] = [];

export const getShopsSnapshot = (): Shop[] => liveShops ?? EMPTY_SHOPS;

/**
 * Id resolution against the SERVING catalog only. A cart carrying an id the
 * live rows do not know (e.g. a stale demo `p1` from before this change)
 * simply stops matching — quiet, never a crash, and never a demo row served
 * in place of a real one.
 */
export const resolveCatalogProduct = (id: string): Product | undefined =>
  (liveProducts ?? EMPTY_PRODUCTS).find((p) => p.id === id);

export const resolveCatalogCategory = (id: string): Category | undefined =>
  (liveCategories ?? EMPTY_CATEGORIES).find((c) => c.id === id);

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
          : [];
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

/**
 * Test-only: serve the given rows as though /api/products had just answered
 * `live`. Tests that need a stocked catalog inject it here instead of
 * relying on demo fallbacks — production never imports this.
 */
export const __serveLiveCatalogForTests = (
  products: Product[] | null,
  categories: Category[] = [],
  shops: Shop[] = [],
): void => {
  liveProducts = products;
  liveCategories = products ? categories : null;
  liveShops = products ? shops : null;
  catalogSettled = products !== null;
  catalogPromise = products === null ? null : Promise.resolve(true);
  if (products) notify();
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
