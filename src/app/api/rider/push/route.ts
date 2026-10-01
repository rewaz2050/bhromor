import { apiError, apiJson } from "@/lib/api-response";
import { riderRoute } from "../_lib";
import { isRiderPushConfigured, publicRiderVapidKey, removeRiderPush, saveRiderPush } from "@/lib/rider-push";

export const dynamic = "force-dynamic";

export const GET = riderRoute("push-status", async ({ service, rider }) => {
  const { count } = await service.from("rider_push_subscriptions").select("id", { count: "exact", head: true }).eq("rider_id", rider.id);
  return apiJson({ configured: isRiderPushConfigured(), publicKey: publicRiderVapidKey(), subscribed: (count ?? 0) > 0 });
});

export const POST = riderRoute("push-subscribe", async ({ service, rider }, request) => {
  if (!isRiderPushConfigured()) return apiError("Push is not configured on the server.", 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const keys = (body?.keys ?? {}) as Record<string, unknown>;
  const result = await saveRiderPush(service, rider.id, { endpoint: body?.endpoint, p256dh: keys.p256dh, auth: keys.auth });
  if (!result.ok) return apiError(result.reason === "missing_table" ? "Rider push migration is not applied." : "Invalid push subscription.", result.reason === "missing_table" ? 503 : 422);
  return apiJson({ ok: true as const });
});

export const DELETE = riderRoute("push-unsubscribe", async ({ service, rider }, request) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  await removeRiderPush(service, rider.id, body?.endpoint);
  return apiJson({ ok: true as const });
});
