/**
 * Server-side storefront reads with demo fallback. Public pages call these
 * instead of importing seeds directly: live rows when the backend serves
 * them, typed seeds otherwise. Failures always fall back — the shop must
 * never 500 because the database had a bad minute.
 */

import "server-only";

import {
  CATEGORIES,
  DELIVERY_ZONES,
  PRODUCTS,
  type Category,
  type DeliveryZone,
  type Product,
} from "../catalog";
import { fetchLiveCatalog } from "./catalog";

export interface StorefrontCatalog {
  products: Product[];
  categories: Category[];
  live: boolean;
}

export async function getStorefrontCatalog(): Promise<StorefrontCatalog> {
  try {
    const live = await fetchLiveCatalog();
    if (live && live.products.length > 0) {
      return { products: live.products, categories: live.categories, live: true };
    }
  } catch {
    // Fall through to seeds.
  }
  return { products: PRODUCTS, categories: CATEGORIES, live: false };
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
    // Fall through to seeds.
  }
  return {
    zones: DELIVERY_ZONES.map((z) => ({ ...z, active: z.active ?? true })),
    live: false,
  };
}

export const findStorefrontProduct = (
  products: Product[],
  slug: string,
): Product | undefined => products.find((p) => p.slug === slug);
