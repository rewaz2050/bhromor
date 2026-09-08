/**
 * Coupons & promotions (§56) — demo, browser-local.
 *
 * Pure validation + discount math on top; an external store below feeds the
 * admin manager and the checkout. Money stays in paisa (§69).
 */

export const COUPONS_STORAGE_KEY = "prosanti.coupons.v1";

export interface Coupon {
  id: string;
  code: string; // stored uppercase
  type: "percent" | "fixed";
  value: number; // percent (1–100) or fixed taka amount in paisa
  minOrder: number; // paisa, 0 = none
  categoryId?: string; // restrict to one category's items, undefined = all
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
  return { ok: true };
};

/** Eligible subtotal — whole cart, or only the restricted category's items. */
export const eligibleSubtotal = (
  coupon: Coupon,
  lines: { productCategory: string; subtotal: number }[],
): number =>
  coupon.categoryId
    ? lines
        .filter((l) => l.productCategory === coupon.categoryId)
        .reduce((s, l) => s + l.subtotal, 0)
    : lines.reduce((s, l) => s + l.subtotal, 0);

/** Discount in paisa for the given eligible amount (never negative). */
export const discountAmount = (
  coupon: Coupon,
  eligible: number,
): number => {
  if (eligible <= 0) return 0;
  if (coupon.type === "fixed") return Math.min(coupon.value, eligible);
  const pct = Math.max(0, Math.min(100, coupon.value));
  return Math.min(eligible, Math.floor((eligible * pct) / 100));
};

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
