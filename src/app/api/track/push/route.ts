/**
 * /api/track/push — a shopper's own phone notifications (2026-09-24).
 *
 *   GET    — { configured, publicKey, ready, watching } for THIS browser
 *   POST   — { endpoint, keys, lang, id, phone } → register this device
 *   DELETE — { endpoint } → forget this device
 *
 * Public by necessity (shoppers are guests — there is no session to gate on),
 * so it repeats the tracker's own ownership proof: the request must carry an
 * order number AND that order's phone number. Consequence worth stating: the
 * only way to subscribe is to already be able to open someone's tracker,
 * which is exactly the number + id the shopper typed at checkout. A leaked
 * endpoint alone cannot subscribe anything, and DELETE only ever removes the
 * exact endpoint the caller's browser already holds.
 *
 * The track page proves the order exists; this route never reveals whether
 * the pair matched (404 wording is the tracker's own).
 */

import { findLiveOrder } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/orders";
import {
  customerPushMarketingFor,
  customerPushReady,
  customerVapidKey,
  customerPushSaveFailureReason,
  isCustomerPushConfigured,
  removeCustomerPushSubscription,
  saveCustomerPushSubscription,
  setCustomerPushMarketing,
} from "@/lib/customer-push";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
/** Generous enough for a shopper retrying, tight enough to stop enumeration. */
const LIMIT = 20;

const MISSING_TABLE =
  "customer_push_subscriptions table nai — Supabase → SQL Editor e supabase/migrations/202609240001_customer_push.sql run korun.";

const guard = (ip: string) => {
  const bucket = checkRateLimit(`track-push:${ip}`, LIMIT, WINDOW_MS);
  if (bucket.allowed) return null;
  const res = apiError("Too many attempts — please wait a moment.", 429);
  res.headers.set("Retry-After", String(bucket.retryAfterSec));
  return res;
};

/** Same proof the tracker demands: this order + this phone, or nothing. */
const orderOwnedBy = async (id: string, phone: string) => {
  const order = await findLiveOrder(id, phone);
  return order ?? null;
};

export async function GET(request?: Request) {
  // The card only needs to know whether it *could* work — no order data here.
  if (!isServiceRoleConfigured()) {
    return apiJson({ configured: isCustomerPushConfigured(), publicKey: customerVapidKey(), ready: false, watching: 0, marketing: null });
  }
  const db = getSupabaseService();
  const status = db
    ? await customerPushReady(db)
    : { ready: false, count: 0 };
  // `?endpoint=` → whether THIS device also opted into drops & offers
  // (UX plan §12). Only the caller's own endpoint makes sense here.
  let marketing: boolean | null = null;
  try {
    const endpoint = request ? new URL(request.url).searchParams.get("endpoint") : null;
    if (db && endpoint) marketing = await customerPushMarketingFor(db, endpoint);
  } catch {
    marketing = null;
  }
  return apiJson({
    configured: isCustomerPushConfigured(),
    publicKey: customerVapidKey(),
    // `ready:false` when migration 202609240001 is missing, so the card can
    // say so instead of failing on the tap.
    ready: status.ready,
    watching: status.count,
    marketing,
  });
}

/**
 * PATCH { endpoint, marketing } — the "drops & offers too" opt-in for the
 * device the caller's browser holds (UX plan §12; migration 202609270001).
 */
export async function PATCH(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  if (!isServiceRoleConfigured()) return apiError("Could not update notifications.", 503);
  const db = getSupabaseService();
  if (!db) return apiError("Could not update notifications.", 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }
  if (typeof body.marketing !== "boolean") return apiError("Invalid request.", 400);
  try {
    const saved = await setCustomerPushMarketing(db, body.endpoint, body.marketing);
    if (!saved.ok) {
      if (saved.reason === "missing_table") {
        return apiError(
          "Broadcast opt-in column nai — supabase/migrations/202609270001_push_broadcasts.sql run korun.",
          503,
        );
      }
      return apiError("Could not update notifications — please try again.", 422);
    }
    return apiJson({ ok: true as const, marketing: body.marketing });
  } catch {
    return apiError("Could not update notifications — please try again.", 503);
  }
}

export async function POST(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  if (!isServiceRoleConfigured()) {
    return apiError("Could not turn on notifications right now.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Could not turn on notifications right now.", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid subscription.", 400);
  }

  const id = typeof body.id === "string" ? body.id.trim().slice(0, 32) : "";
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim().slice(0, 24) : "";
  if (id === "" || phoneRaw === "") {
    return apiError("Order ID and phone number are required.", 400);
  }

  try {
    const order = await orderOwnedBy(id, phoneRaw);
    if (!order) {
      return apiError(
        "No order found — double-check the order ID and the phone number you ordered with.",
        404,
      );
    }
    const saved = await saveCustomerPushSubscription(db, {
      endpoint: body.endpoint,
      keys: (body.keys ?? undefined) as { p256dh?: unknown; auth?: unknown } | undefined,
      // The canonical number comes from the ORDER, never from the request body.
      phone: normalizePhone(order.customer?.phone ?? phoneRaw),
      lang: body.lang,
    });
    if (!saved.ok) {
      if (saved.reason === "missing_table") return apiError(MISSING_TABLE, 503);
      return apiError("Could not save this device — please try again.", 422);
    }
    return apiJson({ ok: true as const });
  } catch (err) {
    if (customerPushSaveFailureReason(err as { code?: string }) === "missing_table") {
      return apiError(MISSING_TABLE, 503);
    }
    return apiError("Could not turn on notifications right now.", 503);
  }
}

export async function DELETE(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  if (!isServiceRoleConfigured()) return apiError("Could not update notifications.", 503);
  const db = getSupabaseService();
  if (!db) return apiError("Could not update notifications.", 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }
  try {
    // Removing a device needs no ownership proof: it only ever deletes the
    // endpoint the caller's own browser just unsubscribed from.
    await removeCustomerPushSubscription(db, body.endpoint);
    return apiJson({ ok: true as const });
  } catch {
    return apiError("Could not update notifications — please try again.", 503);
  }
}
