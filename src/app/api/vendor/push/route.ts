/**
 * Vendor (shop) Web Push registrations (migration 202610020018).
 *
 * GET    — { configured, publicKey, tableReady, count } for THIS shop
 * POST   — { endpoint, keys: { p256dh, auth } } → register this device
 * DELETE — { endpoint } → forget this device (only the caller's own shop's)
 *
 * Always scoped to the session shop (`requireVendor`): a shop id in the body or URL is
 * ignored, so one shop can neither subscribe nor remove another's phone. The table is
 * service-role only, hence the service client after the vendor check.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { isPushConfigured } from "@/lib/push";
import { getSupabaseService } from "@/lib/supabase-server";
import {
  removeVendorSubscription,
  saveVendorSubscription,
  vendorPushStatus,
} from "@/lib/vendor-push";
import { vendorRoute } from "../_lib";

export const dynamic = "force-dynamic";

const MISSING_TABLE =
  "vendor_push_subscriptions table nai — supabase/migrations/202610020018_vendor_push.sql run korun.";

export const GET = vendorRoute("push-status", async (ctx) => {
  const service = getSupabaseService();
  if (!service) return apiError("Server is not configured.", 503);
  return apiJson(await vendorPushStatus(service, ctx.shopId));
});

export const POST = vendorRoute(
  "push-subscribe",
  async (ctx, request) => {
    if (!isPushConfigured()) return apiError("Push is not configured on the server.", 503);
    const service = getSupabaseService();
    if (!service) return apiError("Server is not configured.", 503);
    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    } | null;
    const saved = await saveVendorSubscription(service, ctx.shopId, ctx.user.id, {
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

export const DELETE = vendorRoute(
  "push-unsubscribe",
  async (ctx, request) => {
    const service = getSupabaseService();
    if (!service) return apiError("Server is not configured.", 503);
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    await removeVendorSubscription(service, ctx.shopId, body?.endpoint);
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
