/**
 * B1 (2026-09-28) — following a shop (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Pure validation + the honest copy the follow card shows. The write itself
 * is /api/shop-follow (service role), the same shape as the stock-watch
 * route, so a phone that is already following is refreshed, never
 * duplicated.
 */

import { isPlausibleBdPhone, normalizeBdPhone } from "./phone";

export interface ShopFollowValue {
  shopId: string;
  phone: string;
  /** The shopper's tick: send new-product news (true) or not (false). */
  marketingOk: boolean;
}

export interface ShopFollowValidation {
  ok: boolean;
  errors: { shopId?: string; phone?: string };
  value: ShopFollowValue;
}

export const validateShopFollow = (raw: unknown): ShopFollowValidation => {
  const body = (raw ?? {}) as Record<string, unknown>;
  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 64) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 24) : "";
  const marketingOk = body.marketingOk === undefined ? true : body.marketingOk === true;
  const errors: ShopFollowValidation["errors"] = {};
  if (shopId.length < 1) errors.shopId = "Which shop is this about?";
  if (!isPlausibleBdPhone(phone)) errors.phone = "Give a mobile number we can reach.";
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      shopId,
      // Only a number we would accept gets normalized — a refused value is
      // never written ("12345" must not become "012345").
      phone: isPlausibleBdPhone(phone) ? normalizeBdPhone(phone) : "",
      marketingOk,
    },
  };
};
