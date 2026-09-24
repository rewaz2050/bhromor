/**
 * Staff Web Push registrations (§ realtime notifications).
 *
 * GET    — { configured, publicKey?, count, tableReady } — everything the
 *          setup card needs to name the exact blocker.
 * POST   — { endpoint, keys: { p256dh, auth } } → upsert this device
 * DELETE — { endpoint } → forget this device
 *
 * Staff-gated: only an authenticated panel may register a device. The
 * subscription itself carries no customer data.
 */

import {
  isPushConfigured,
  publicVapidKey,
  pushSubscriptionsReady,
  removePushSubscription,
  savePushSubscriptionResult,
} from "@/lib/push";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** Shown when the device table is missing — one SQL paste, then it works. */
const MISSING_TABLE =
  "push_subscriptions table nai — Supabase → SQL Editor e supabase/migrations/202609210001_push_subscriptions.sql run korun, tarpor abar cheshta korun.";

export const GET = staffRoute("push-status", async ({ db }) => {
  const { ready, count } = await pushSubscriptionsReady(db);
  return apiJson({
    configured: isPushConfigured(),
    publicKey: publicVapidKey(),
    count,
    // 2026-09-23: the card must be able to say "the table is missing"
    // instead of showing a happy "0 devices".
    tableReady: ready,
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
  const saved = await savePushSubscriptionResult(db, {
    endpoint: b.endpoint,
    keys: b.keys,
  });
  if (!saved.ok) {
    if (saved.reason === "missing_table") return apiError(MISSING_TABLE, 503);
    return apiError("Could not save that subscription.", 422);
  }
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
