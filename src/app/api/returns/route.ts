/**
 * POST /api/returns — customer starts an exchange/return pickup (P1 #13).
 *
 * Body: { id: "PS-…", phone: "01…", reason: "…", details: "…" }
 *
 * Ownership is the same proof as /api/track (order number + phone), the
 * 7-day window and one-return-per-parent are enforced in the database
 * (ps_return_eligible), and the pickup leg becomes a real zero-charge
 * return order (ps_create_return_request → ps_place_order) that the shop
 * approves, dispatches to a rider, and rides back to the shop.
 */

import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import {
  createReturnRequest,
  ReturnRequestError,
} from "@/lib/db/returns";
import { notifyStaff } from "@/lib/db/engagement";

export const dynamic = "force-dynamic";

const REASONS = new Set([
  "size",
  "color",
  "defective",
  "other",
]);

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`returns:${ip}`, 10, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Returns are temporarily unavailable.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase().slice(0, 32) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 24) : "";
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  const details = typeof b.details === "string" ? b.details.trim() : "";

  if (id === "" || phone === "") {
    return apiError("Order ID and phone number are required.", 400);
  }
  if (!REASONS.has(reason)) {
    return apiError("Pick a return reason.", 422);
  }
  if (details.length < 5 || details.length > 400) {
    return apiError(
      "Tell the shop a little more — a sentence is enough.",
      422,
    );
  }

  const db = getSupabaseService();
  if (!db) return apiError("Returns are temporarily unavailable.", 503);

  try {
    const created = await createReturnRequest(db, {
      orderNo: id,
      phone,
      reason,
      details,
    });
    await notifyStaff(db, {
      kind: "order",
      title: "Return / exchange requested",
      body: `Order ${id} — pickup request for ${reason}. Approve or reject it in Admin → Orders.`,
      href: "/admin/orders",
    });
    return apiJson(
      {
        order: { id: created.orderNo, status: "pending", isReturn: true },
      },
      201,
    );
  } catch (err) {
    if (err instanceof ReturnRequestError) {
      return apiError(err.message, err.status, { code: err.reason });
    }
    return apiError("Returns are temporarily unavailable.", 503);
  }
}
