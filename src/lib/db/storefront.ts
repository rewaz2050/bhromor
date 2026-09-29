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

/** A shop by its URL slug. */
export const findStorefrontShop = (
  shops: Shop[],
  slug: string,
): Shop | undefined => shops.find((s) => s.slug === slug);

/**
 * C5 — the piece at `/shops/<shopSlug>/p/<productSlug>`.
 *
 * The shop is part of the address, so the slug only has to be unique inside
 * it: two shops may both sell "premium-cotton-panjabi" and still each own a
 * page. Rows saved before the marketplace carry no `shopId`; they belong to
 * the first shop, the same rule `productShopId` applies everywhere else.
 */
export const findShopProduct = (
  products: Product[],
  shops: Shop[],
  shopSlug: string,
  productSlug: string,
): Product | undefined => {
  const shop = findStorefrontShop(shops, shopSlug);
  if (!shop) return undefined;
  const fallbackShopId = shops[0]?.id ?? "";
  return products.find(
    (p) => p.slug === productSlug && (p.shopId ?? fallbackShopId) === shop.id,
  );
};

/**
 * Every piece carrying this slug, across shops — the pre-C5 spelling
 * (`/product/<slug>`) can only be answered by looking at all of them.
 */
export const findStorefrontProductsBySlug = (
  products: Product[],
  slug: string,
): Product[] => products.filter((p) => p.slug === slug);
