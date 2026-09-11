/**
 * POST /api/orders — place a cash-on-delivery order.
 *
 * - Demo mode (no service role): `{ demoMode: true }` — the client keeps
 *   the existing browser-local flow. The server never fakes persistence.
 * - Live mode: validates the payload against server-loaded prices/zones/
 *   coupons, reserves stock, writes orders + snapshots + history, and
 *   returns the stored order (with its trigger-assigned order_no).
 *
 * Rate-limited per IP; validation failures are 422 with field errors.
 */

import { validateOrderPayload } from "@/lib/order-validation";
import {
  OrderPlacementError,
  countOrdersForPhone,
  loadOrderSnapshot,
  placeLiveOrder,
} from "@/lib/db/orders";
import { normalizePhone } from "@/lib/orders";
import { notifyStaff } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 20;

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`orders:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Invalid order data.", 400);
  }

  try {
    const snapshot = await loadOrderSnapshot();
    if (!snapshot || snapshot.products.length === 0) {
      return apiError(
        "Online ordering is not set up yet — please call 01700-000000 to order.",
        503,
        { code: "NOT_SEEDED" },
      );
    }
    // Per-user first-10-free: count THIS phone's earlier orders (server-side).
    const payloadPhone = (payload as { phone?: unknown })?.phone;
    snapshot.customerOrderCount = await countOrdersForPhone(
      getSupabaseService() as NonNullable<ReturnType<typeof getSupabaseService>>,
      normalizePhone(typeof payloadPhone === "string" ? payloadPhone : ""),
    );
    const validation = validateOrderPayload(payload, snapshot);
    if (!validation.ok) {
      return apiError("Please fix the highlighted fields.", 422, {
        errors: validation.errors,
      });
    }
    const order = await placeLiveOrder(validation.draft, snapshot);
    if (!order) {
      return apiError("Could not place the order — please try again.", 503);
    }
    const staffDb = getSupabaseService();
    if (staffDb) {
      await notifyStaff(staffDb, {
        kind: "order",
        title: `New order ${order.id} awaiting confirmation`,
        body: `${order.customer.name} (${order.customer.area}) — ${(order.total / 100).toLocaleString("en-IN")} taka, cash on delivery.`,
        href: `/admin/orders/${order.id}`,
      });
    }
    return apiJson({ order }, 201);
  } catch (err) {
    if (err instanceof OrderPlacementError) {
      return apiError(err.message, err.status, { field: err.field });
    }
    return apiError("Could not place the order — please try again.", 503);
  }
}
