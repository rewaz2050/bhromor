/**
 * POST /api/coupons/validate { code, items: [{ productId, qty }], zoneId? } —
 * single source of truth for coupon checks at checkout.
 *
 * Prices against the database; an unconfigured backend answers 503.
 * Supports percent, fixed, and free_delivery with zone restriction and max cap.
 */

import type { Product } from "@/lib/catalog";
import {
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  isFreeDeliveryCoupon,
  normalizeCode,
  type Coupon,
} from "@/lib/coupons";
import { loadOrderSnapshot } from "@/lib/db/orders";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`coupon-check:${ip}`, 30, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  const b = (body ?? {}) as {
    code?: string;
    zoneId?: string;
    items?: { productId?: string; qty?: number }[];
  };
  const code = typeof b.code === "string" ? normalizeCode(b.code) : "";
  if (code === "") return apiError("Coupon code is required.", 400);
  const zoneId = typeof b.zoneId === "string" ? b.zoneId.trim() : undefined;
  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  if (rawItems.length === 0) return apiError("The cart is empty.", 400);

  let products: Product[];
  let coupons: Coupon[];
  try {
    const snapshot = await loadOrderSnapshot();
    if (!snapshot || snapshot.products.length === 0) {
      return apiError("Coupons are unavailable right now.", 503);
    }
    products = snapshot.products;
    coupons = snapshot.coupons;
  } catch {
    return apiError("Coupons are unavailable right now.", 503);
  }

  const lines: { productCategory: string; subtotal: number }[] = [];
  for (const item of rawItems) {
    const product = products.find((p) => p.id === item?.productId);
    const qty =
      typeof item?.qty === "number" ? Math.floor(item.qty) : Number.NaN;
    if (!product || !Number.isFinite(qty) || qty < 1 || qty > 10) {
      return apiError("The cart changed — please review it and retry.", 422);
    }
    lines.push({ productCategory: product.category, subtotal: product.price * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const coupon = findCoupon(coupons, code);
  if (!coupon) {
    return apiJson({ valid: false as const, reason: "Unknown code — double-check the spelling." });
  }
  const redeemable = isCouponRedeemable(coupon, subtotal, zoneId);
  if (!redeemable.ok) {
    return apiJson({
      valid: false as const,
      reason: redeemable.reason ?? "This code cannot be used.",
    });
  }
  if (isFreeDeliveryCoupon(coupon)) {
    return apiJson({
      valid: true as const,
      code: coupon.code,
      discount: 0,
      freeDelivery: true as const,
      description: coupon.description,
    });
  }
  const eligible = eligibleSubtotal(coupon, lines);
  if (eligible <= 0) {
    return apiJson({
      valid: false as const,
      reason: "This code does not apply to the items in your cart.",
    });
  }
  return apiJson({
    valid: true as const,
    code: coupon.code,
    discount: Math.min(discountAmount(coupon, eligible), subtotal),
    type: coupon.type,
    maxDiscount: coupon.maxDiscount,
    description: coupon.description,
  });
}
