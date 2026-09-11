/**
 * GET /api/track?id=PS-…&phone=01… — guest order tracking lookup.
 *
 * Verifies the phone server-side and returns the order, or a deliberately
 * vague 404 that does not reveal whether the id or the phone was wrong.
 */

import { findLiveOrder } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 30;

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`track:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isServiceRoleConfigured()) {
    return apiError("Tracking is temporarily unavailable.", 503);
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim().slice(0, 32);
  const phone = (url.searchParams.get("phone") ?? "").trim().slice(0, 24);
  if (id === "" || phone === "") {
    return apiError("Order ID and phone number are required.", 400);
  }

  try {
    const order = await findLiveOrder(id, phone);
    if (!order) {
      return apiError(
        "No order found — double-check the order ID and the phone number you ordered with.",
        404,
      );
    }
    return apiJson({ order });
  } catch {
    return apiError("Tracking is temporarily unavailable.", 503);
  }
}
