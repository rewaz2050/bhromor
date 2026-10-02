/**
 * Rider Web Push registrations (item I, migration 202610020004).
 *
 * GET    — { configured, publicKey, tableReady, count } for THIS rider
 * POST   — { endpoint, keys: { p256dh, auth } } → register this device
 * DELETE — { endpoint } → forget this device (only the caller's own)
 *
 * Always scoped to the session rider (`requireRider`): a rider id in the body
 * or URL is ignored, so one rider can neither subscribe nor remove another's
 * phone. A subscription carries no personal data; the pushes it receives
 * carry none either.
 */
import { apiError, apiJson } from "@/lib/api-response";
import {
  removeRiderSubscription,
  riderPushStatus,
  saveRiderSubscription,
} from "@/lib/rider-push";
import { isPushConfigured } from "@/lib/push";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

const MISSING_TABLE =
  "rider_push_subscriptions table nai — supabase/migrations/202610020004_rider_push.sql run korun.";

export const GET = riderRoute("push-status", async (ctx) =>
  apiJson(await riderPushStatus(ctx.service, ctx.rider.id)),
);

export const POST = riderRoute(
  "push-subscribe",
  async (ctx, request) => {
    if (!isPushConfigured()) return apiError("Push is not configured on the server.", 503);
    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    } | null;
    const saved = await saveRiderSubscription(ctx.service, ctx.rider.id, {
      endpoint: body?.endpoint,
      keys: body?.keys,
    });
    if (!saved.ok) {
      if (saved.reason === "missing_table") return apiError(MISSING_TABLE, 503);
      if (saved.reason === "invalid") return apiError("Could not save that subscription.", 422);
      return apiError("Could not turn on notifications — please try again.", 503);
    }
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);

export const DELETE = riderRoute(
  "push-unsubscribe",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    await removeRiderSubscription(ctx.service, ctx.rider.id, body?.endpoint);
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
