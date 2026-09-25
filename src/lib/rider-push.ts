/**
 * Web Push for RIDER devices — a dispatch offer buzzes the rider's phone even
 * when the browser is closed or the screen is off.
 *
 * Why this exists (2026-09-25, "rider offer paochhe na"):
 *   • `push_subscriptions` (202609210001) was staff-only and
 *     `customer_push_subscriptions` (202609240001) was shopper-only, so a rider
 *     had no push channel at all.
 *   • The rider's only way to learn about an offer was polling
 *     `/api/rider/jobs`, and `usePoll` (src/lib/use-poll.ts) STOPS while the
 *     tab is hidden — a phone in a pocket polls nothing.
 *   • So an offer was born, lived out its window unseen, and expired. The shop
 *     saw "Ready — call rider" succeed; the rider saw nothing. That is the
 *     whole bug report.
 *
 * Devices live in the SAME `push_subscriptions` table with `rider_id` set
 * (migration 202609250001). The staff fan-out filters those rows out, so a
 * rider never receives the owner's order notices and vice versa.
 *
 * Same rules as src/lib/push.ts: no VAPID keys → honest no-op, nothing throws,
 * dead subscriptions (404/410) are pruned, and the fan-out is capped so a
 * sleepy push service can never stall the shop's status tap.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureVapid,
  isPushConfigured,
  publicVapidKey,
  pushSaveFailureReason,
  type PushSaveResult,
} from "./push";

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const nonEmpty = (value: string | undefined | null, max = 500): string => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? "" : trimmed.slice(0, max);
};

/** How long the fan-out may take before the caller moves on. */
const FANOUT_CAP_MS = 2_500;

/**
 * Save this rider's device. `rider_id` comes from the verified rider session
 * (never from the request body), so one rider cannot register another's phone.
 */
export const saveRiderPushSubscription = async (
  db: SupabaseClient,
  riderId: string,
  sub: { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
): Promise<PushSaveResult> => {
  const endpoint = clean(sub.endpoint, 500);
  const p256dh = clean(sub.keys?.p256dh, 200);
  const auth = clean(sub.keys?.auth, 200);
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "") {
    return { ok: false, reason: "invalid" };
  }
  const { error } = await db.from("push_subscriptions").upsert(
    { endpoint, p256dh, auth, rider_id: riderId },
    { onConflict: "endpoint" },
  );
  const reason = pushSaveFailureReason(error);
  return reason ? { ok: false, reason } : { ok: true };
};

/** Forget this device (rider turned notifications off). */
export const removeRiderPushSubscription = async (
  db: SupabaseClient,
  riderId: string,
  endpoint: unknown,
): Promise<void> => {
  const cleanEndpoint = clean(endpoint, 500);
  if (!cleanEndpoint) return;
  await db
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", cleanEndpoint)
    .eq("rider_id", riderId);
};

/** Does this rider have a live device? The toggle reads it on open. */
export const riderPushReady = async (
  db: SupabaseClient,
  riderId: string,
): Promise<{ ready: boolean; count: number; configured: boolean }> => {
  const { count, error } = await db
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("rider_id", riderId);
  return {
    ready: pushSaveFailureReason(error) !== "missing_table",
    count: count ?? 0,
    configured: isPushConfigured(),
  };
};

export interface RiderOfferNotice {
  orderNo: string;
  area: string;
  totalLabel: string;
  /** Seconds the rider has to answer — the offer window from the DB. */
  windowSeconds?: number;
}

/**
 * Buzz ONE rider's devices about a new offer. Best-effort: the poll and the
 * dispatch board remain the guarantees, so any failure here changes nothing a
 * shopper can see in a wrong way.
 */
export const pushRiderOffer = async (
  db: SupabaseClient,
  riderId: string,
  notice: RiderOfferNotice,
): Promise<{ sent: number }> => {
  if (!ensureVapid()) return { sent: 0 };
  const { data } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("rider_id", riderId)
    .limit(5);
  const subs = ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      endpoint: clean(row.endpoint, 500),
      p256dh: clean(row.p256dh, 200),
      auth: clean(row.auth, 200),
    }))
    .filter((s) => s.endpoint !== "" && s.p256dh !== "" && s.auth !== "");
  if (subs.length === 0) return { sent: 0 };

  const minutes = Math.max(
    1,
    Math.round((notice.windowSeconds ?? 300) / 60),
  );
  const payload = JSON.stringify({
    title: `🛵 Notun delivery — ${nonEmpty(notice.orderNo, 32) || "order"}`,
    body: `${nonEmpty(notice.area, 80) || "Order"} · ${nonEmpty(notice.totalLabel, 40)} · ${minutes} min-er moddhe Accept korun`,
    href: "/rider",
    tag: `offer-${nonEmpty(notice.orderNo, 32)}`,
  });

  let sent = 0;
  try {
    const results = Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 900 },
          );
          sent += 1;
        } catch (err) {
          const status =
            typeof err === "object" && err !== null && "statusCode" in err
              ? Number((err as { statusCode?: unknown }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            await removeRiderPushSubscription(db, riderId, sub.endpoint);
          }
        }
      }),
    );
    await Promise.race([
      results,
      new Promise<void>((resolve) => setTimeout(resolve, FANOUT_CAP_MS)),
    ]);
  } catch {
    // Push is a bonus; the poll is the source of truth.
  }
  return { sent };
};

/** Everything the rider's setup card needs, in one read. */
export const riderPushStatus = async (
  db: SupabaseClient,
  riderId: string,
): Promise<{ configured: boolean; publicKey: string | null; count: number; tableReady: boolean }> => {
  const { ready, count } = await riderPushReady(db, riderId);
  return {
    configured: isPushConfigured(),
    publicKey: publicVapidKey(),
    count,
    tableReady: ready,
  };
};

/**
 * Find the live offer on an order and buzz whoever it went to. This is the one
 * call the shop's "Ready — call rider", the dispatch board's "Assign" and the
 * 15-minute self-heal all make — the offer is born inside a database trigger,
 * so the server reads the result back rather than passing a rider id around.
 *
 * Best-effort and never throws: an order that dispatched correctly must not
 * fail because a push service was slow.
 */
/** True for an orders.id row key (vs a public PS-… order number). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notifyRiderOfOffer = async (
  db: SupabaseClient,
  /** The orders row id, or the public order number — callers hold either. */
  orderRef: string,
): Promise<{ sent: number }> => {
  if (!isPushConfigured()) return { sent: 0 };
  const ref = orderRef.trim();
  if (ref === "") return { sent: 0 };
  try {
    let orderId = ref;
    let orderNo = "";
    let area = "";
    let total: number | null = null;
    if (UUID_RE.test(ref)) {
      const { data: row, error } = await db
        .from("orders")
        .select("order_no, area, total")
        .eq("id", ref)
        .maybeSingle();
      // A failed read is not a pushable order — stop rather than buzz with a
      // blank title and a TTL the rider cannot act on.
      if (error || !row) return { sent: 0 };
      const o = row as { order_no?: string; area?: string; total?: number };
      orderNo = o.order_no ?? "";
      area = o.area ?? "";
      total = typeof o.total === "number" ? o.total : null;
    } else {
      orderNo = ref.toUpperCase();
      const { data: row, error } = await db
        .from("orders")
        .select("id, area, total")
        .eq("order_no", orderNo)
        .maybeSingle();
      const o = row as { id?: string; area?: string; total?: number } | null;
      if (error || !o?.id) return { sent: 0 };
      orderId = o.id;
      area = o.area ?? "";
      total = typeof o.total === "number" ? o.total : null;
    }

    const { data: assignment, error: assignError } = await db
      .from("delivery_assignments")
      .select("id, rider_id, offered_at, expires_at")
      .eq("order_id", orderId)
      .eq("state", "offered")
      .order("offered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignError) return { sent: 0 };
    const riderId = (assignment as { rider_id?: string } | null)?.rider_id;
    if (!riderId) return { sent: 0 };

    const offeredAt = Date.parse(String((assignment as { offered_at?: string })?.offered_at ?? ""));
    const expiresAt = Date.parse(String((assignment as { expires_at?: string })?.expires_at ?? ""));
    const windowSeconds =
      Number.isFinite(offeredAt) && Number.isFinite(expiresAt) && expiresAt > offeredAt
        ? Math.round((expiresAt - offeredAt) / 1000)
        : 300;

    return await pushRiderOffer(db, riderId, {
      orderNo,
      area,
      totalLabel: total !== null ? `৳${Math.round(total / 100)}` : "",
      windowSeconds,
    });
  } catch {
    return { sent: 0 };
  }
};
