/**
 * Rider Web Push registration — the rider's own phone buzzes for a dispatch
 * offer even with the app closed (2026-09-25).
 *
 * GET    — { configured, publicKey?, count, tableReady } — the toggle card
 *          needs these to name the exact blocker instead of failing silently.
 * POST   — { endpoint, keys: { p256dh, auth } } → upsert THIS rider's device
 * DELETE — { endpoint } → forget this device
 *
 * Rider-gated, and `rider_id` always comes from the verified session: a rider
 * can never register or remove another rider's phone.
 */

import { isPushConfigured } from "@/lib/push";
import {
  removeRiderPushSubscription,
  riderPushStatus,
  saveRiderPushSubscription,
} from "@/lib/rider-push";
import { apiError, apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

const MISSING_TABLE =
  "push_subscriptions table / rider_id column nai — Supabase → SQL Editor e supabase/migrations/202609250001_rider_dispatch_fix.sql run korun, tarpor abar cheshta korun.";

export const GET = riderRoute("push-status", async (ctx) => {
  const service = getSupabaseService();
  if (!service) return apiError("Push is not configured on the server.", 503);
  return apiJson(await riderPushStatus(service, ctx.rider.id));
});

export const POST = riderRoute(
  "push-subscribe",
  async (ctx, request) => {
    if (!isPushConfigured()) {
      return apiError("Push is not configured on the server.", 503);
    }
    const service = getSupabaseService();
    if (!service) return apiError("Push is not configured on the server.", 503);
    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    } | null;
    const saved = await saveRiderPushSubscription(service, ctx.rider.id, {
      endpoint: body?.endpoint,
      keys: body?.keys,
    });
    if (!saved.ok) {
      if (saved.reason === "missing_table") return apiError(MISSING_TABLE, 503);
      return apiError("Could not save that subscription.", 422);
    }
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);

export const DELETE = riderRoute(
  "push-unsubscribe",
  async (ctx, request) => {
    const service = getSupabaseService();
    if (!service) return apiJson({ ok: true as const });
    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown;
    } | null;
    await removeRiderPushSubscription(service, ctx.rider.id, body?.endpoint);
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
