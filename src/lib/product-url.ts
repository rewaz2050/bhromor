/**
 * Where a piece lives on the storefront (C5).
 *
 * A product page is addressed by BOTH the shop and the piece:
 * `/shops/<shop-slug>/p/<product-slug>`. Two shops may sell a piece with the
 * same name — "Premium Cotton Panjabi" is a name, not an identity — so the
 * shop has to be part of the address, and the piece's own page can say whose
 * shop it is without a lookup.
 *
 * `/product/<slug>` still answers (it existed before C5 and links to it are
 * out in the world: WhatsApp shares, Facebook cards, printed QR codes) but it
 * now sends the visitor on to the shop-scoped address with a 301.
 */

import type { Product, Shop } from "./catalog";

/** The segment that marks "a product page" inside a shop. */
export const PRODUCT_SEGMENT = "p";

export const productPath = (shopSlug: string, productSlug: string): string =>
  `/shops/${encodeURIComponent(shopSlug)}/${PRODUCT_SEGMENT}/${encodeURIComponent(productSlug)}`;

/** The pre-C5 address. Kept only for the redirect and for links we cannot resolve to a shop. */
export const legacyProductPath = (productSlug: string): string =>
  `/product/${encodeURIComponent(productSlug)}`;

/**
 * The link for a piece. `shops` is the serving shop list.
 *
 * STRICT on purpose: a link is only put inside a shop when the row says which
 * shop it belongs to. Guessing ("no shopId, so shop #1") would send a live
 * piece from a vendor to the wrong shop's address — and that address 404s.
 * When the shop is not known the LEGACY address is used: it still answers, and
 * it sends the visitor to the right shop. (Resolving an address is the other
 * way round — `findShopProduct` is tolerant, because a row saved before the
 * marketplace genuinely does belong to the first shop.)
 */
export const productHref = (
  product: Pick<Product, "slug"> & Partial<Pick<Product, "shopId">>,
  shops: readonly Pick<Shop, "id" | "slug">[],
): string => {
  const shop = product.shopId
    ? shops.find((s) => s.id === product.shopId)
    : undefined;
  return shop?.slug
    ? productPath(shop.slug, product.slug)
    : legacyProductPath(product.slug);
};

/**
 * Anchors that open a product page — used by the click analytics, which has
 * to recognise BOTH spellings while old links still circulate.
 */
export const PRODUCT_LINK_SELECTOR = `a[href^='/product/'], a[href*='/${PRODUCT_SEGMENT}/']`;

/** True for either spelling of a product link. Test helper + analytics guard. */
export const isProductHref = (href: string): boolean =>
  href.startsWith("/product/") || href.includes(`/${PRODUCT_SEGMENT}/`);
