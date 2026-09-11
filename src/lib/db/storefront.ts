/**
 * Server-side storefront reads — live only. Public pages call these instead
 * of importing seeds directly: live rows when the backend serves them, empty
 * otherwise. Failures fall back to empty — the shop must never 500 because
 * the database had a bad minute, but it also never invents rows.
 */

import "server-only";

import type { Category, DeliveryZone, Product, Shop } from "../catalog";
import { fetchLiveCatalog } from "./catalog";

export interface StorefrontCatalog {
  products: Product[];
  categories: Category[];
  shops: Shop[];
  live: boolean;
}

const EMPTY: StorefrontCatalog = {
  products: [],
  categories: [],
  shops: [],
  live: false,
};

export async function getStorefrontCatalog(): Promise<StorefrontCatalog> {
  try {
    const live = await fetchLiveCatalog();
    if (live && live.products.length > 0) {
      return {
        products: live.products,
        categories: live.categories,
        shops: live.shops,
        live: true,
      };
    }
  } catch {
    // Fall through to empty.
  }
  return EMPTY;
}

export async function getStorefrontZones(): Promise<{
  zones: DeliveryZone[];
  live: boolean;
}> {
  try {
    const live = await fetchLiveCatalog();
    if (live && live.products.length > 0 && live.zones.length > 0) {
      return { zones: live.zones, live: true };
    }
  } catch {
    // Fall through to empty.
  }
  return { zones: [], live: false };
}

export const findStorefrontProduct = (
  products: Product[],
  slug: string,
): Product | undefined => products.find((p) => p.slug === slug);
