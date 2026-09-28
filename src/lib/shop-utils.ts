/**
 * Marketplace shop helpers (phase 2, slice 4) — pure + client-safe.
 *
 * Both the server catalog and the storefront UI resolve "which shop sells
 * this product" through here, so rows without a shopId fall back to the
 * owner's shop and live rows (always tagged) behave identically.
 */

import type { Product, Shop } from "./catalog";
import type { TranslationKey } from "./translations";
import { isOnVacation, vacationDaysLeft, vacationReopenDate } from "./shop-vacation";

/** Public shop card — contactEmail is ALWAYS stripped. */
export const toPublicShop = (shop: Shop): Shop => {
  const pub = { ...shop };
  delete pub.contactEmail;
  // Round 4 — the staff decision trail (who approved, rejection notes) is
  // never part of the storefront payload either.
  delete pub.review;
  return pub;
};

/**
 * Round 4 — a vendor's or rider's OWN payload (/api/vendor/me, /api/rider/me)
 * carries no review trail: the rejection reason reaches them through the
 * 403 message, and the reviewer's staff e-mail is nobody else's business.
 */
export const withoutReview = <T extends { review?: unknown }>(row: T): T => {
  const copy = { ...row };
  delete copy.review;
  return copy;
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

/**
 * A shop can take orders only while active AND open AND not on holiday.
 *
 * B6: the `now` argument defaults to the real clock, so every existing caller
 * (cards, the bag, checkout, the purchase panel) honours a booked holiday
 * without another change — and tests can pin the clock.
 */
/**
 * B6 — why the shop cannot take an order, in the shopper's own words.
 *
 * A plain closure is a fact ("Closed"); a booked holiday is a promise, so it
 * carries the day the shop takes orders again. The wording is the caller's so
 * the storefront can say it in Bengali.
 */
export const shopClosedCopy = (
  shop: Shop,
  t: (key: TranslationKey) => string,
  now: number = Date.now(),
): { text: string; holiday: boolean } => {
  const reopen = vacationReopenDate(shop.vacation, now);
  if (!reopen) return { text: t("shops.closed"), holiday: false };
  const days = vacationDaysLeft(shop.vacation, now);
  const key =
    days > 1 ? "shops.onHolidayDays" : days === 1 ? "shops.onHolidayTomorrow" : "shops.onHoliday";
  return {
    holiday: true,
    text: t(key).replace("{date}", reopen).replace("{n}", String(days)),
  };
};

export const isShopOrderable = (shop: Shop, now: number = Date.now()): boolean =>
  shop.status === "active" && shop.isOpen && !isOnVacation(shop.vacation, now);

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
