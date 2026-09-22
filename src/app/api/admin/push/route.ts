/**
 * Staff Web Push registrations (§ realtime notifications).
 *
 * GET    — { configured, publicKey?, count } (what the setup card needs)
 * POST   — { endpoint, keys: { p256dh, auth } } → upsert this device
 * DELETE — { endpoint } → forget this device
 *
 * Staff-gated: only an authenticated panel may register a device. The
 * subscription itself carries no customer data.
 */

import {
  isPushConfigured,
  publicVapidKey,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("push-status", async ({ db }) => {
  const { count } = await db
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });
  return apiJson({
    configured: isPushConfigured(),
    publicKey: publicVapidKey(),
    count: count ?? 0,
  });
});

export const POST = staffRoute("push-subscribe", async ({ db }, request) => {
  if (!isPushConfigured()) {
    return apiError("Push is not configured on the server.", 503);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid subscription.", 400);
  }
  const b = (body ?? {}) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const saved = await savePushSubscription(db, {
    endpoint: b.endpoint,
    keys: b.keys,
  });
  if (!saved) return apiError("Could not save that subscription.", 422);
  return apiJson({ ok: true as const });
});

export const DELETE = staffRoute("push-unsubscribe", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  await removePushSubscription(
    db,
    (body as Record<string, unknown> | null)?.endpoint,
  );
  return apiJson({ ok: true as const });
});
