/**
 * Coupons & promotions (§56) — Sunamganj real promo codes.
 * Admin can create: percent, fixed, free_delivery with min order, category, zone, max cap, expiry.
 * Pure validation + discount math; money in paisa (§69).
 */

export type CouponType = "percent" | "fixed" | "free_delivery";

export interface Coupon {
  id: string;
  code: string; // stored uppercase
  type: CouponType;
  value: number; // percent (1–100) or fixed taka amount in paisa, 0 for free_delivery
  minOrder: number; // paisa, 0 = none
  categoryId?: string; // restrict to one category's items, undefined = all
  zoneId?: string; // restrict to Sunamganj zone (z1..z4), undefined = all zones
  maxDiscount?: number; // paisa cap for percent type, e.g. 50% up to ৳500
  description?: string; // admin note, e.g. "Eid offer for Boropara"
  validFrom?: number; // epoch ms
  validUntil?: number; // epoch ms
  usageLimit?: number; // undefined = unlimited
  used: number;
  active: boolean;
}

export const normalizeCode = (code: string): string =>
  code.trim().toUpperCase().replace(/\s+/g, "");

export const isCouponRedeemable = (
  coupon: Coupon,
  subtotal: number,
  zoneId?: string,
  now: number = Date.now(),
): { ok: boolean; reason?: string } => {
  if (!coupon.active) return { ok: false, reason: "This code is not active." };
  if (coupon.validFrom && now < coupon.validFrom)
    return { ok: false, reason: "This code has not started yet." };
  if (coupon.validUntil && now > coupon.validUntil)
    return { ok: false, reason: "This code has expired." };
  if (coupon.usageLimit !== undefined && coupon.used >= coupon.usageLimit)
    return { ok: false, reason: "This code has reached its usage limit." };
  if (coupon.minOrder > 0 && subtotal < coupon.minOrder)
    return {
      ok: false,
      reason: `Minimum order for this code is ${(coupon.minOrder / 100).toLocaleString("en-IN")} taka.`,
    };
  if (coupon.zoneId && coupon.zoneId !== zoneId) {
    return { ok: false, reason: `This code is only valid for ${coupon.zoneId} zone.` };
  }
  return { ok: true };
};

/** Eligible subtotal — whole cart, or only the restricted category's items. */
export const eligibleSubtotal = (
  coupon: Coupon,
  lines: { productCategory: string; subtotal: number }[],
): number => {
  if (coupon.type === "free_delivery") return 0; // free delivery doesn't need eligible
  return coupon.categoryId
    ? lines
        .filter((l) => l.productCategory === coupon.categoryId)
        .reduce((s, l) => s + l.subtotal, 0)
    : lines.reduce((s, l) => s + l.subtotal, 0);
};

/** Discount in paisa for the given eligible amount (never negative). */
export const discountAmount = (
  coupon: Coupon,
  eligible: number,
): number => {
  if (coupon.type === "free_delivery") return 0;
  if (eligible <= 0) return 0;
  if (coupon.type === "fixed") return Math.min(coupon.value, eligible);
  const pct = Math.max(0, Math.min(100, coupon.value));
  let discount = Math.min(eligible, Math.floor((eligible * pct) / 100));
  if (coupon.maxDiscount && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  return discount;
};

export const isFreeDeliveryCoupon = (coupon: Coupon): boolean =>
  coupon.type === "free_delivery";

export const findCoupon = (list: Coupon[], code: string): Coupon | undefined =>
  list.find((c) => c.code === normalizeCode(code));

export const upsertCoupon = (list: Coupon[], coupon: Coupon): Coupon[] => {
  const i = list.findIndex((c) => c.id === coupon.id);
  if (i === -1) return [{ ...coupon, code: normalizeCode(coupon.code) }, ...list];
  const next = [...list];
  next[i] = { ...coupon, code: normalizeCode(coupon.code) };
  return next;
};

export const removeCoupon = (list: Coupon[], id: string): Coupon[] =>
  list.filter((c) => c.id !== id);

export const codeTaken = (list: Coupon[], code: string, exceptId?: string): boolean =>
  list.some(
    (c) => c.code === normalizeCode(code) && c.id !== exceptId,
  );

export const couponDisplayValue = (coupon: Coupon): string => {
  if (coupon.type === "free_delivery") return "Free Delivery";
  if (coupon.type === "fixed") return `৳${(coupon.value / 100).toLocaleString()} off`;
  return `${coupon.value}% off${coupon.maxDiscount ? ` up to ৳${(coupon.maxDiscount / 100).toLocaleString()}` : ""}`;
};
