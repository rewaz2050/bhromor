/**
 * Marketplace shop helpers (phase 2, slice 4) — pure + client-safe.
 *
 * Both the server catalog and the storefront UI resolve "which shop sells
 * this product" through here, so rows without a shopId fall back to the
 * owner's shop and live rows (always tagged) behave identically.
 */

import type { Product, Shop } from "./catalog";

/** Public shop card — contactEmail is ALWAYS stripped. */
export const toPublicShop = (shop: Shop): Shop => {
  const pub = { ...shop };
  delete pub.contactEmail;
  return pub;
};

/** Rows without shopId implicitly belong to the fallback shop. */
export const productShopId = (
  product: Pick<Product, "shopId">,
  fallbackShopId: string,
): string => product.shopId ?? fallbackShopId;

export const shopById = (
  shops: Shop[],
  shopId: string,
): Shop | undefined => shops.find((s) => s.id === shopId);

/** A shop can take orders only while active AND open. */
export const isShopOrderable = (shop: Shop): boolean =>
  shop.status === "active" && shop.isOpen;

export const shopServesZone = (shop: Shop, zoneId: string): boolean =>
  shop.zoneIds.includes(zoneId);

/**
 * Discovery filter: without a zone everything orderable shows; with a zone
 * only shops serving it do. Suspended/closed shops never appear in browse
 * surfaces (their detail pages stay reachable with an honest notice).
 */
export const filterProductsForZone = (
  products: Product[],
  shops: Shop[],
  zoneId: string | null,
  fallbackShopId: string,
): Product[] =>
  products.filter((p) => {
    const shop = shopById(shops, productShopId(p, fallbackShopId));
    if (!shop || !isShopOrderable(shop)) return false;
    if (zoneId && !shopServesZone(shop, zoneId)) return false;
    return true;
  });

/** Distinct shop ids across resolved cart lines (single-shop guard input). */
export const lineShopIds = (
  lines: { product: Product }[],
  fallbackShopId: string,
): string[] => [
  ...new Set(lines.map((l) => productShopId(l.product, fallbackShopId))),
];

/**
 * Split ETA label: kitchen prep plus the zone's delivery promise.
 * "Ready in ~15 min · at your door in 45–60 min"
 */
export const splitEta = (prepMinutes: number, etaLabel: string): string =>
  `Ready in ~${prepMinutes} min · at your door in ${etaLabel}`;
