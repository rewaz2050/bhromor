/**
 * Vendor (shop) Web Push (migration 202610020018).
 *
 * Two messages, both about money that is waiting:
 *   • a NEW ORDER for the shop — the phone buzzes with the panel closed;
 *   • a REMINDER that the shop owes PROSANTI (shop-own-wallet shops only), once a day.
 *
 * Same VAPID pair and `web-push` as the staff, shopper and rider channels. Best-effort and
 * bounded (~2.5 s): it NEVER throws and never holds up an order. Payloads carry no customer
 * data — the shop opens the panel to see the order. A database without the migration simply
 * skips. Dead endpoints (404/410) are pruned.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureVapid, isPushConfigured, publicVapidKey, pushSaveFailureReason } from "@/lib/push";

const CAP_MS = 2_500;

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const iso = (ms: number): string => new Date(ms).toISOString();

export interface VendorPushPayload {
  title: string;
  body: string;
  href: string;
  tag: string;
  renotify?: boolean;
  urgent?: boolean;
  skipIfFocused?: boolean;
}

interface Sub {
  shop_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export type VendorPushSaveResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "missing_table" | "error" };

export const saveVendorSubscription = async (
  service: SupabaseClient,
  shopId: string,
  userId: string,
  sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
): Promise<VendorPushSaveResult> => {
  const endpoint = clean(sub.endpoint, 500);
  const p256dh = clean(sub.keys?.p256dh, 200);
  const auth = clean(sub.keys?.auth, 200);
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "") {
    return { ok: false, reason: "invalid" };
  }
  // endpoint is unique: a phone handed to another shop moves with its owner.
  const { error } = await service
    .from("vendor_push_subscriptions")
    .upsert(
      { shop_id: shopId, user_id: userId, endpoint, p256dh, auth, last_seen_at: iso(Date.now()) },
      { onConflict: "endpoint" },
    );
  const reason = pushSaveFailureReason(error);
  return reason ? { ok: false, reason } : { ok: true };
};

/** A shop can only forget ITS OWN device. */
export const removeVendorSubscription = async (
  service: SupabaseClient,
  shopId: string,
  endpoint: unknown,
): Promise<void> => {
  const e = clean(endpoint, 500);
  if (!e) return;
  await service.from("vendor_push_subscriptions").delete().eq("endpoint", e).eq("shop_id", shopId);
};

export const vendorPushStatus = async (
  service: SupabaseClient,
  shopId: string,
): Promise<{ configured: boolean; publicKey: string | null; tableReady: boolean; count: number }> => {
  const { count, error } = await service
    .from("vendor_push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("shop_id", shopId);
  return {
    configured: isPushConfigured(),
    publicKey: publicVapidKey(),
    tableReady: pushSaveFailureReason(error) !== "missing_table",
    count: count ?? 0,
  };
};

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

const statusOf = (err: unknown): number =>
  typeof err === "object" && err !== null && "statusCode" in err
    ? Number((err as { statusCode?: unknown }).statusCode)
    : 0;

const sendTo = async (
  service: SupabaseClient,
  subs: Sub[],
  payload: VendorPushPayload,
  ttlSeconds: number,
): Promise<number> => {
  const body = JSON.stringify(payload);
  let accepted = 0;
  const jobs = subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: Math.max(0, Math.floor(ttlSeconds)), urgency: payload.urgent ? "high" : "normal" },
      );
      accepted += 1;
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) {
        await service.from("vendor_push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CAP_MS);
  });
  await Promise.race([Promise.allSettled(jobs), capped]);
  clearTimeout(timer);
  return accepted;
};

export const newOrderPayload = (orders: number): VendorPushPayload => ({
  title: orders === 1 ? "🛍️ New order!" : `🛍️ ${orders} new orders!`,
  body: "Open the PROSANTI vendor panel to confirm and start preparing.",
  href: "/vendor/orders",
  tag: "vendor-new-order",
  renotify: true,
  urgent: true,
  skipIfFocused: true,
});

export const owesPayload = (owedPaisa: number): VendorPushPayload => ({
  title: "💸 You owe PROSANTI",
  body: `Customers paid your own bKash/Nagad — please send PROSANTI ৳${(owedPaisa / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} (commission, delivery charge and tip).`,
  href: "/vendor/earnings",
  tag: "vendor-owes",
  renotify: false,
});

/**
 * Push `payload` to every device of the given shops. `ttlSeconds` = how long the push service
 * may hold it for a sleeping phone. Returns the number of devices that accepted. Never throws.
 */
export const pushVendorShops = async (
  service: SupabaseClient,
  shopIds: readonly string[],
  payload: VendorPushPayload,
  ttlSeconds = 3600,
): Promise<number> => {
  try {
    const ids = [...new Set(shopIds.filter((id) => typeof id === "string" && id !== ""))];
    if (ids.length === 0 || !ensureVapid()) return 0;
    const { data, error } = await service
      .from("vendor_push_subscriptions")
      .select("shop_id, endpoint, p256dh, auth")
      .in("shop_id", ids)
      .limit(500);
    if (error || !data || data.length === 0) return 0;
    return await sendTo(service, data as Sub[], payload, ttlSeconds);
  } catch {
    return 0;
  }
};

/** A customer order just landed: tell each shop that got one (one push per shop, however many parcels). */
export const notifyVendorsNewOrders = async (
  service: SupabaseClient,
  shopIds: readonly (string | undefined | null)[],
): Promise<void> => {
  const counts = new Map<string, number>();
  for (const id of shopIds) {
    if (typeof id === "string" && id !== "") counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  await Promise.all(
    [...counts.entries()].map(([shopId, n]) => pushVendorShops(service, [shopId], newOrderPayload(n), 900)),
  );
};
