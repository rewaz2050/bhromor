/**
 * GET /api/track?id=PS-…&phone=01…[&t=…] — guest order tracking lookup.
 *
 * Verifies the phone server-side and returns the order, or a deliberately
 * vague 404 that does not reveal whether the id or the phone was wrong.
 *
 * Security 2026-10-14 (H3): a signed `t` token (from a server-built link)
 * proves ownership outright and gets the relaxed budget; the manual
 * id+phone path runs under a strict durable limit plus a separate
 * failed-lookup budget, because order numbers are guessable and phones
 * are often public knowledge.
 */

import { findLiveOrder } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { gateTrackRequest } from "@/lib/track-gate";
import { checkDurableRateLimit } from "@/lib/rate-limit-durable";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
/** Manual lookup budget (order number + phone, no token). */
const LIMIT = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim().slice(0, 32);
  const phone = (url.searchParams.get("phone") ?? "").trim().slice(0, 24);
  const token = (url.searchParams.get("t") ?? "").trim().slice(0, 64);
  if (id === "" || phone === "") {
    return apiError("Order ID and phone number are required.", 400);
  }

  const gate = await gateTrackRequest(request, {
    name: "track",
    id,
    phone,
    token,
    limit: LIMIT,
  });
  if (!gate.allowed) return gate.response;

  if (!isServiceRoleConfigured()) {
    return apiError("Tracking is temporarily unavailable.", 503);
  }

  try {
    const order = await findLiveOrder(id, phone);
    if (!order) {
      // Enumeration brake: failed guesses share their own tight budget —
      // once it is spent, stop answering (29) instead of confirming misses.
      const ip = clientIpFromHeaders(request.headers);
      const miss = await checkDurableRateLimit(`track-miss:${ip}`, 10, WINDOW_MS);
      if (!miss.allowed) {
        const res = apiError("Too many attempts — please wait a moment.", 429);
        res.headers.set("Retry-After", String(miss.retryAfterSec));
        return res;
      }
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
