/**
 * POST /api/coupons/best { items: [{ productId, qty }], zoneId? } —
 * returns the single best redeemable coupon for the cart ("auto-apply best
 * offer"). Real: prices against the live coupon table; an unconfigured or
 * empty backend answers 503. Returns { none: true } when nothing applies.
 */

import { bestCoupon } from "@/lib/coupons";
import { loadOrderSnapshot } from "@/lib/db/orders";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`coupon-best:${ip}`, 30, 60_000);
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
    zoneId?: string;
    items?: { productId?: string; qty?: number }[];
  };
  const zoneId = typeof b.zoneId === "string" ? b.zoneId.trim() : undefined;
  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  if (rawItems.length === 0) return apiError("The cart is empty.", 400);

  let snapshot;
  try {
    snapshot = await loadOrderSnapshot();
  } catch {
    snapshot = null;
  }
  if (!snapshot || snapshot.products.length === 0) {
    return apiError("Coupons are unavailable right now.", 503);
  }

  const lines: { productCategory: string; subtotal: number }[] = [];
  for (const item of rawItems) {
    const product = snapshot.products.find((p) => p.id === item?.productId);
    const qty =
      typeof item?.qty === "number" ? Math.floor(item.qty) : Number.NaN;
    if (!product || !Number.isFinite(qty) || qty < 1 || qty > 10) {
      return apiError("The cart changed — please review it and retry.", 422);
    }
    lines.push({ productCategory: product.category, subtotal: product.price * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const best = bestCoupon(snapshot.coupons, lines, subtotal, zoneId);
  if (!best) return apiJson({ none: true as const });
  return apiJson(best);
}
