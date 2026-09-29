/**
 * C2 (2026-09-28) — split one checkout payload into one order per shop.
 *
 * The buyer taps once; the shop still gets its own order. This module decides
 * what each shop's order carries, then hands every piece to the ordinary
 * single-order validator — so prices, stock, coupons, zones, the courier
 * floor, free-delivery thresholds and the shop's own open/holiday state are
 * all enforced by the same code they always were, just per parcel instead of
 * per basket.
 *
 * Two rules do the real work:
 *
 *   • a parcel's money is its own — subtotal, weight, delivery and the
 *     courier minimum are computed from that shop's lines alone;
 *
 *   • what the basket has only ONE of goes with the biggest parcel: the tip,
 *     the gift wrap and the referral credit. And a fixed-amount coupon, whose
 *     value must not double just because the basket split.
 */

import { bnDigits } from "./arrival";
import { findCoupon, normalizeCode } from "./coupons";
import {
  MULTI_SHOP_MAX,
  groupBasketByShop,
  planCouponAcrossShops,
  primaryShopId,
  type BasketLine,
} from "./multi-shop";
import {
  validateOrderPayload,
  type OrderPayload,
  type OrderSnapshot,
  type ValidOrderDraft,
} from "./order-validation";

export interface SplitGroup {
  shopId: string;
  payload: OrderPayload;
}

export interface SplitFieldError {
  field: string;
  message: string;
}

export type SplitPayload = { ok: true; groups: SplitGroup[] } | { ok: false; errors: SplitFieldError[] };

export type SplitValidation =
  | { ok: true; drafts: ValidOrderDraft[] }
  | { ok: false; errors: SplitFieldError[] };

/** Products by id, with the price the SHOP published (never the client's). */
const productIndex = (snapshot: OrderSnapshot) => {
  const byId = new Map<string, { shopId?: string | null; price: number }>();
  for (const product of snapshot.products) {
    byId.set(product.id, { shopId: product.shopId ?? null, price: product.price });
  }
  return byId;
};

const withoutKeys = <T>(source: T, keys: readonly string[]): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  return copy;
};

/**
 * The per-shop payloads for one checkout. A single-shop bag comes back as ONE
 * group holding the original payload untouched, so nothing about the ordinary
 * path changes.
 */
export const splitPayloadByShop = (raw: unknown, snapshot: OrderSnapshot): SplitPayload => {
  const body = (raw ?? {}) as Partial<OrderPayload>;

  // No shop rows (an older snapshot, a fixture) → the marketplace rules do not
  // apply; leave the payload exactly as it arrived.
  if (!snapshot.shops || snapshot.shops.length === 0) {
    return { ok: true, groups: [{ shopId: "", payload: raw as OrderPayload }] };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const byId = productIndex(snapshot);
  const fallbackShopId = snapshot.shops[0].id;
  const lines: BasketLine[] = items.map((it) => ({
    productId: String(it?.productId ?? ""),
    variantLabel: typeof it?.variantLabel === "string" ? it.variantLabel : "",
    qty: Math.max(1, Number(it?.qty ?? 1) || 1),
    unitPrice: Number(byId.get(String(it?.productId ?? ""))?.price ?? 0),
  }));
  const groups = groupBasketByShop(
    lines,
    (productId) => byId.get(productId)?.shopId ?? null,
    fallbackShopId,
  );

  if (groups.length === 0) {
    return { ok: true, groups: [{ shopId: "", payload: raw as OrderPayload }] };
  }

  if (groups.length > MULTI_SHOP_MAX) {
    return {
      ok: false,
      errors: [
        {
          field: "items",
          message: `এক চেকআউটে সর্বোচ্চ ${bnDigits(String(MULTI_SHOP_MAX))}টি দোকানের পণ্য রাখা যায় — বাকিগুলো আলাদা করে অর্ডার করুন।`,
        },
      ],
    };
  }

  const typedCode = typeof body.couponCode === "string" ? normalizeCode(body.couponCode) : "";
  let couponPlan = null as ReturnType<typeof planCouponAcrossShops> | null;
  if (typedCode !== "") {
    const coupon = findCoupon(snapshot.coupons, typedCode) ?? null;
    if (!coupon) {
      return {
        ok: false,
        errors: [{ field: "couponCode", message: "Unknown code — double-check the spelling." }],
      };
    }
    const owner = coupon.shopId ? snapshot.shops.find((s) => s.id === coupon.shopId) : undefined;
    couponPlan = planCouponAcrossShops({
      coupon,
      groups,
      zoneId: typeof body.zoneId === "string" ? body.zoneId : undefined,
      now: snapshot.now ?? Date.now(),
      shopName: owner?.name,
    });
    if (couponPlan.refused) {
      return {
        ok: false,
        errors: [{ field: "couponCode", message: couponPlan.refused }],
      };
    }
  }

  const primary = primaryShopId(groups);
  const carries = (shopId: string): boolean =>
    !couponPlan || couponPlan.entries.some((e) => e.shopId === shopId && e.apply);

  return {
    ok: true,
    groups: groups.map((group) => {
      const isPrimary = group.shopId === primary;
      // Everything except the per-parcel fields is identical on every order:
      // the same person, address, pin, slot and payment.
      const base = withoutKeys(body as OrderPayload, [
        "items",
        "tip_amount",
        "gift",
        "referral_code",
        "couponCode",
        "weight_kg",
      ]) as unknown as OrderPayload;
      const payload: OrderPayload = {
        ...base,
        items: group.lines.map((line) => ({
          productId: line.productId,
          variantLabel: line.variantLabel ?? "",
          qty: line.qty,
        })),
        // Each parcel is weighed and quoted on its own: one heavy parcel must
        // not add a weight surcharge to the light one beside it.
        weight_kg: group.weightKg,
        // One tip, one wrap, one referral credit — they ride the big parcel.
        ...(isPrimary && body.tip_amount !== undefined ? { tip_amount: body.tip_amount } : {}),
        ...(isPrimary && body.gift ? { gift: body.gift } : {}),
        ...(isPrimary && body.referral_code ? { referral_code: body.referral_code } : {}),
        ...(carries(group.shopId) ? { couponCode: typedCode || undefined } : {}),
      };
      return { shopId: group.shopId, payload };
    }),
  };
};

/**
 * Validate every shop's order on its own. The first parcel the server cannot
 * honour is the answer: the buyer hears which shop, and nothing is placed.
 */
export const validateSplitOrder = (raw: unknown, snapshot: OrderSnapshot): SplitValidation => {
  const split = splitPayloadByShop(raw, snapshot);
  if (!split.ok) return split;
  const drafts: ValidOrderDraft[] = [];
  for (const group of split.groups) {
    const result = validateOrderPayload(group.payload, snapshot);
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors.map((e) => ({ field: e.field, message: e.message })),
      };
    }
    drafts.push(result.draft);
  }
  return { ok: true, drafts };
};
