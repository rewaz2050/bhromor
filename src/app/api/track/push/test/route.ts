/**
 * POST /api/track/push/test — send one real push to this order's devices.
 *
 * The shopper's equivalent of the staff card's "Test pathan": it proves the
 * whole pipeline (VAPID keys, the stored endpoint, the service worker) before
 * the shopper trusts it with a real delivery. Ownership is the tracker's own
 * proof again — order number + that order's phone — and the rate limit keeps
 * a bored visitor from buzzing their own phone in a loop.
 *
 * `sent: 0` is a real answer: the browser is subscribed but the server has no
 * row for this phone (the save never landed), which is exactly the state the
 * card needs to name.
 */

import { findLiveOrder } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/orders";
import { pushOrderMilestone } from "@/lib/customer-push";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bucket = checkRateLimit(
    `track-push-test:${clientIpFromHeaders(request.headers)}`,
    4,
    60_000,
  );
  if (!bucket.allowed) {
    const res = apiError("Too many tests — wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Notifications are not available right now.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Notifications are not available right now.", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }
  const id = typeof body.id === "string" ? body.id.trim().slice(0, 32) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 24) : "";
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
    const sent = await pushOrderMilestone(db, {
      phone: normalizePhone(order.customer?.phone ?? phone),
      orderNo: order.id,
      kind: "test",
      total: null,
    });
    return apiJson({ ok: true as const, sent });
  } catch {
    return apiError("Could not send the test — please try again.", 503);
  }
}
