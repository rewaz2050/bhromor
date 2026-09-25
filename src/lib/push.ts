/**
 * Web Push for staff devices — an order lands, the owner's phone buzzes,
 * even with the admin panel closed.
 *
 * How it works:
 *   • The admin enables notifications once from the panel (PushSetup card);
 *     the browser subscription lands in `push_subscriptions` (migration
 *     202609210001).
 *   • Every `notifyStaff()` call ALSO fans a Web Push out to those devices
 *     (same event stream the in-panel inbox already shows).
 *   • No VAPID keys configured → everything here is an honest no-op, the
 *     panel simply says the feature is off. Missing keys never throw.
 *
 * Payloads carry the notice title/body/href only — the click-through opens
 * the admin page, which is staff-gated anyway.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffNotice } from "@/lib/db/engagement";

/** Null/empty-safe trim (env values never throw here). */
const nonEmpty = (value: string | undefined | null, max = 500): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
};

/** VAPID subject — who runs the push (mailto is the spec's convention). */
const vapidSubject = (): string =>
  nonEmpty(process.env.PUSH_VAPID_SUBJECT) ?? "mailto:ops@prosanti.example";

/** True when both VAPID keys are present — the feature can actually send. */
export const isPushConfigured = (): boolean =>
  nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY) !== null &&
  nonEmpty(process.env.PUSH_VAPID_PRIVATE_KEY) !== null;

/** The public key the browser needs to subscribe (null while unconfigured). */
export const publicVapidKey = (): string | null =>
  nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY);

let configuredOnce: boolean | null = null;
/** Set the VAPID keys exactly once per process (idempotent, best-effort). */
const ensureVapid = (): boolean => {
  if (configuredOnce !== null) return configuredOnce;
  if (!isPushConfigured()) {
    configuredOnce = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      vapidSubject(),
      nonEmpty(process.env.PUSH_VAPID_PUBLIC_KEY) ?? "",
      nonEmpty(process.env.PUSH_VAPID_PRIVATE_KEY) ?? "",
    );
    configuredOnce = true;
  } catch {
    configuredOnce = false;
  }
  return configuredOnce;
};

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

interface PushRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Why a device could not be stored — the panel turns each one into words. */
export type PushSaveFailure = "invalid" | "missing_table" | "error";

export type PushSaveResult = { ok: true } | { ok: false; reason: PushSaveFailure };

/**
 * A missing `push_subscriptions` table (migration 202609210001 never pasted)
 * is NOT the same failure as a malformed subscription: the first is an
 * owner-side setup step, the second is a bad request. PostgREST answers
 * `42P01` / `PGRST205` (or the plain-English "does not exist" /
 * "Could not find the table") — every one of those means "run the SQL".
 */
export const pushSaveFailureReason = (
  error: { code?: string; message?: string } | null | undefined,
): PushSaveFailure | null => {
  if (!error) return null;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    return "missing_table";
  }
  return "error";
};

/** Save a device subscription, with the reason when it fails. */
export const savePushSubscriptionResult = async (
  db: SupabaseClient,
  sub: { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
): Promise<PushSaveResult> => {
  const endpoint = clean(sub.endpoint, 500);
  const p256dh = clean(sub.keys?.p256dh, 200);
  const auth = clean(sub.keys?.auth, 200);
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "") {
    return { ok: false, reason: "invalid" };
  }
  const { error } = await db.from("push_subscriptions").upsert(
    { endpoint, p256dh, auth },
    { onConflict: "endpoint" },
  );
  const reason = pushSaveFailureReason(error);
  return reason ? { ok: false, reason } : { ok: true };
};

export const savePushSubscription = async (
  db: SupabaseClient,
  sub: { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
): Promise<boolean> => (await savePushSubscriptionResult(db, sub)).ok;

/**
 * Is the device table actually there? The status card must not report
 * "0 devices, all good" when every save is being refused by a missing table
 * (that is exactly how the owner's ON button failed silently on 2026-09-23).
 */
export const pushSubscriptionsReady = async (
  db: SupabaseClient,
): Promise<{ ready: boolean; count: number }> => {
  const { count, error } = await db
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });
  return {
    ready: pushSaveFailureReason(error) !== "missing_table",
    count: count ?? 0,
  };
};

export const removePushSubscription = async (
  db: SupabaseClient,
  endpoint: unknown,
): Promise<void> => {
  const cleanEndpoint = clean(endpoint, 500);
  if (!cleanEndpoint) return;
  await db.from("push_subscriptions").delete().eq("endpoint", cleanEndpoint);
};

const listPushSubscriptions = async (
  db: SupabaseClient,
): Promise<PushRow[]> => {
  const { data } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .limit(50);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    endpoint: clean(row.endpoint, 500),
    p256dh: clean(row.p256dh, 200),
    auth: clean(row.auth, 200),
  }));
};

/**
 * Fan one staff notice out to every registered device. Best-effort by
 * design: any failure is swallowed (the inbox still has the row), and
 * subscriptions the push service reports gone (404/410) are pruned.
 * Capped at ~2.5s so order placement never waits on a sleepy push service.
 */
export const pushStaffNotice = async (
  db: SupabaseClient,
  notice: StaffNotice,
): Promise<void> => {
  try {
    if (!ensureVapid()) return;
    const subs = await listPushSubscriptions(db);
    if (subs.length === 0) return;
    const payload = JSON.stringify({
      title: nonEmpty(notice.title, 160) || "PROSANTI update",
      body: nonEmpty(notice.body, 300) ?? "",
      href: nonEmpty(notice.href, 200) || "/admin",
    });
    const results = Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600 },
          );
          return "ok";
        } catch (err) {
          const status =
            typeof err === "object" && err !== null && "statusCode" in err
              ? Number((err as { statusCode?: unknown }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            await removePushSubscription(db, sub.endpoint);
          }
          return "failed";
        }
      }),
    );
    // Race against the cap — a sleepy push service must not stall checkout.
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 2_500),
    );
    await Promise.race([results, timeout]);
  } catch {
    // Push is a bonus; the in-panel inbox is the source of truth.
  }
};
