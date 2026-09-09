/**
 * POST /api/coupons/validate { code, items: [{ productId, qty }] } —
 * single source of truth for coupon checks at checkout.
 *
 * Live mode prices against the database; demo mode against the seeds.
 * Either way the client never decides a discount by itself, and the order
 * route re-validates before persisting.
 */

import { PRODUCTS, type Product } from "@/lib/catalog";
import { seedCoupons } from "@/lib/coupons-store";
import {
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  normalizeCode,
  type Coupon,
} from "@/lib/coupons";
import { loadOrderSnapshot } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
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
    items?: { productId?: string; qty?: number }[];
  };
  const code = typeof b.code === "string" ? normalizeCode(b.code) : "";
  if (code === "") return apiError("Coupon code is required.", 400);
  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  if (rawItems.length === 0) return apiError("The cart is empty.", 400);

  let products: Product[];
  let coupons: Coupon[];
  if (isServiceRoleConfigured()) {
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
  } else {
    products = PRODUCTS;
    coupons = seedCoupons();
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
  const redeemable = isCouponRedeemable(coupon, subtotal);
  if (!redeemable.ok) {
    return apiJson({
      valid: false as const,
      reason: redeemable.reason ?? "This code cannot be used.",
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
  });
}
