/**
 * Rider Web Push (item I, 2026-10-02 — docs/AUDIT-RIDER-MONEY-2026-09-30.md §23).
 *
 * A job offer lives 90 seconds. The old alert (vibrate + title flash) only works
 * while the rider's app is open; this module is the other half — the phone
 * buzzes with the app closed. Same VAPID pair and `web-push` as the staff and
 * shopper channels; a separate table because the audience, the identity (a
 * rider id, not a phone number) and the retention differ.
 *
 *   • Offers are born in SQL (the ready-for-pickup trigger and the expiry
 *     sweep), where TypeScript cannot see them. `pushPendingRiderOffers` finds
 *     offered + unexpired + not-yet-pushed assignments and CLAIMS them
 *     (`push_notified_at`, update … where null) before sending, so concurrent
 *     sweeps never buzz a phone twice. It runs right after everything that can
 *     create an offer: the expiry sweep (rider feed / dispatch board / cron),
 *     and the status routes that make an order dispatchable.
 *   • One push per rider per sweep ("3 new offers"), never one per order.
 *     Payloads carry NO customer data — the rider opens the app to see the job.
 *   • TTL = what is left of the offer: a push that arrives after the offer
 *     expired is worse than none, so the push service is told to drop it.
 *   • Best-effort and bounded (~2.5 s): never throws, never holds up an order
 *     advance. A database without migration 202610020004 simply skips.
 *   • Dead endpoints (404/410) are pruned.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureVapid, isPushConfigured, publicVapidKey, pushSaveFailureReason } from "@/lib/push";

const CAP_MS = 2_500;
/** Offers with less than this left are not worth a push (the rider could not act). */
const MIN_REMAINING_MS = 12_000;
/** In-process throttle for the poll-driven path (rider feeds poll every 15 s). */
const THROTTLE_MS = 6_000;
let lastSweepAt = 0;

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Missing table/column (migration 202610020004 not run) — a quiet skip, never an error. */
const isMissingDbObject = (err: { code?: string | null; message?: string | null } | null | undefined): boolean => {
  if (!err) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(err.code ?? "")) return true;
  return /does not exist|could not find the (table|column)|schema cache/i.test(err.message ?? "");
};

const iso = (ms: number): string => new Date(ms).toISOString();

export interface RiderPushPayload {
  title: string;
  body: string;
  href: string;
  tag: string;
  /** Re-alert even when a notification with this tag is already showing. */
  renotify?: boolean;
  /** Stay on screen until acted on (offers) and use the long vibration. */
  urgent?: boolean;
  /** Skip the notification when the rider is already looking at the app. */
  skipIfFocused?: boolean;
}

interface Sub {
  rider_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export type RiderPushSaveResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "missing_table" | "error" };

export const saveRiderSubscription = async (
  service: SupabaseClient,
  riderId: string,
  sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
): Promise<RiderPushSaveResult> => {
  const endpoint = clean(sub.endpoint, 500);
  const p256dh = clean(sub.keys?.p256dh, 200);
  const auth = clean(sub.keys?.auth, 200);
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "") {
    return { ok: false, reason: "invalid" };
  }
  // endpoint is unique: a phone handed to another rider moves with its owner.
  const { error } = await service
    .from("rider_push_subscriptions")
    .upsert(
      { rider_id: riderId, endpoint, p256dh, auth, last_seen_at: iso(Date.now()) },
      { onConflict: "endpoint" },
    );
  const reason = pushSaveFailureReason(error);
  return reason ? { ok: false, reason } : { ok: true };
};

/** A rider can only forget THEIR OWN device. */
export const removeRiderSubscription = async (
  service: SupabaseClient,
  riderId: string,
  endpoint: unknown,
): Promise<void> => {
  const clean_ = clean(endpoint, 500);
  if (!clean_) return;
  await service
    .from("rider_push_subscriptions")
    .delete()
    .eq("endpoint", clean_)
    .eq("rider_id", riderId);
};

export const riderPushStatus = async (
  service: SupabaseClient,
  riderId: string,
): Promise<{ configured: boolean; publicKey: string | null; tableReady: boolean; count: number }> => {
  const { count, error } = await service
    .from("rider_push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("rider_id", riderId);
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

/** Send one payload to some devices; prune the dead. Returns accepted count. */
const sendTo = async (
  service: SupabaseClient,
  subs: Sub[],
  payload: RiderPushPayload,
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
        await service.from("rider_push_subscriptions").delete().eq("endpoint", sub.endpoint);
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

export const offerPushPayload = (offers: number, secondsLeft: number): RiderPushPayload => ({
  title: offers === 1 ? "🔔 নতুন ডেলিভারি অফার" : `🔔 ${offers}টি নতুন ডেলিভারি অফার`,
  body: `অ্যাপ খুলে ${Math.max(10, Math.round(secondsLeft))} সেকেন্ডের মধ্যে নিন — প্রথমে যে নেবে সে পাবে।`,
  href: "/rider",
  tag: "rider-offers",
  renotify: true,
  urgent: true,
  skipIfFocused: true,
});

export interface PendingOfferPush {
  /** Offers claimed (marked as pushed). */
  claimed: number;
  /** Riders whose device accepted a push. */
  riders: number;
  skipped?: "unconfigured" | "throttled" | "missing_migration" | "nothing";
}

/**
 * Push every open, not-yet-pushed offer to its rider's devices. `force`
 * bypasses the in-process throttle (status routes want it immediately).
 * Never throws.
 */
export const pushPendingRiderOffers = async (
  service: SupabaseClient,
  opts: { force?: boolean; nowMs?: number } = {},
): Promise<PendingOfferPush> => {
  const none = (skipped: PendingOfferPush["skipped"]): PendingOfferPush => ({ claimed: 0, riders: 0, skipped });
  try {
    if (!ensureVapid()) return none("unconfigured");
    const now = opts.nowMs ?? Date.now();
    if (!opts.force && now - lastSweepAt < THROTTLE_MS) return none("throttled");
    lastSweepAt = now;

    const { data, error } = await service
      .from("delivery_assignments")
      .select("id, rider_id, order_id, expires_at")
      .eq("state", "offered")
      .is("push_notified_at", null)
      .gt("expires_at", iso(now + MIN_REMAINING_MS))
      .limit(200);
    if (error) return none(isMissingDbObject(error) ? "missing_migration" : "nothing");
    const candidates = (data ?? []) as { id: string; rider_id: string; order_id: string; expires_at: string }[];
    if (candidates.length === 0) return none("nothing");

    const riderIds = [...new Set(candidates.map((c) => c.rider_id))];
    const { data: subRows, error: subError } = await service
      .from("rider_push_subscriptions")
      .select("rider_id, endpoint, p256dh, auth")
      .in("rider_id", riderIds)
      .limit(500);
    if (subError) return none(isMissingDbObject(subError) ? "missing_migration" : "nothing");
    const subs = (subRows ?? []) as Sub[];
    const subscribed = new Set(subs.map((s) => s.rider_id));
    // Offers for riders with no device stay untouched (no write, no claim).
    const ours = candidates.filter((c) => subscribed.has(c.rider_id));
    if (ours.length === 0) return none("nothing");

    // CLAIM before sending — a concurrent sweep gets back only what we did not take.
    const { data: claimedRows, error: claimError } = await service
      .from("delivery_assignments")
      .update({ push_notified_at: iso(now) })
      .in("id", ours.map((c) => c.id))
      .is("push_notified_at", null)
      .select("id, rider_id, order_id, expires_at");
    if (claimError) return none(isMissingDbObject(claimError) ? "missing_migration" : "nothing");
    const claimed = (claimedRows ?? []) as { id: string; rider_id: string; order_id: string; expires_at: string }[];
    if (claimed.length === 0) return none("nothing");

    const byRider = new Map<string, { orders: Set<string>; soonest: number }>();
    for (const row of claimed) {
      const entry = byRider.get(row.rider_id) ?? { orders: new Set<string>(), soonest: Number.POSITIVE_INFINITY };
      entry.orders.add(row.order_id);
      entry.soonest = Math.min(entry.soonest, Date.parse(row.expires_at));
      byRider.set(row.rider_id, entry);
    }

    let reached = 0;
    await Promise.all(
      [...byRider.entries()].map(async ([riderId, entry]) => {
        const secondsLeft = Math.max(0, (entry.soonest - now) / 1000);
        const accepted = await sendTo(
          service,
          subs.filter((s) => s.rider_id === riderId),
          offerPushPayload(entry.orders.size, secondsLeft),
          secondsLeft,
        );
        if (accepted > 0) reached += 1;
      }),
    );
    return { claimed: claimed.length, riders: reached };
  } catch {
    return none("nothing");
  }
};

/** Office announcement → the rider's (or every rider's) devices. Never throws. */
export const pushRiderAnnouncement = async (
  service: SupabaseClient,
  input: { riderId: string | null; title: string; body: string; important: boolean },
): Promise<number> => {
  try {
    if (!ensureVapid()) return 0;
    let query = service.from("rider_push_subscriptions").select("rider_id, endpoint, p256dh, auth").limit(500);
    if (input.riderId) query = query.eq("rider_id", input.riderId);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return 0;
    return await sendTo(
      service,
      data as Sub[],
      {
        title: (input.important ? "❗ " : "📢 ") + (clean(input.title, 110) || "অফিসের বার্তা"),
        body: clean(input.body, 140),
        href: "/rider/inbox",
        tag: "rider-announcement",
        renotify: true,
        urgent: input.important,
      },
      6 * 3600,
    );
  } catch {
    return 0;
  }
};

/** Test hook: the in-process throttle is module state. */
export const resetRiderPushThrottle = (): void => {
  lastSweepAt = 0;
};
