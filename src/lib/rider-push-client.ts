/**
 * Rider-side Web Push — "notification on korun" for the rider's own phone.
 *
 * The rider's job feed polls every 15 s and `usePoll` stops while the tab is
 * hidden, so a phone in a pocket never saw a new offer before it expired. This
 * is the other half: one tap subscribes the device, and every dispatch offer
 * then buzzes it (src/lib/rider-push.ts).
 *
 * Reuses the staff push plumbing (same VAPID keys, same /sw.js) — only the
 * server route differs, because the endpoint is stored against the rider.
 */

"use client";

import {
  ensurePermission,
  ensureSubscription,
  pushBlocker,
  readPermission,
  readPushEnv,
  subscriptionJson,
  type PushEnv,
} from "./push-client";

export interface RiderPushStatus {
  configured: boolean;
  publicKey: string | null;
  count: number;
  tableReady: boolean;
}

export type RiderPushFailure =
  | "unconfigured"
  | "unsupported"
  | "insecure"
  | "in-app"
  | "denied"
  | "dismissed"
  | "save-failed";

export type RiderPushResult =
  | { ok: true }
  | { ok: false; reason: RiderPushFailure; message?: string };

const readJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    cache: "no-store",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(data?.error || "Something went wrong — please try again.");
  }
  return (data ?? {}) as T;
};

/** What the server knows about this rider's devices. */
export const fetchRiderPushStatus = async (): Promise<RiderPushStatus> =>
  readJson<RiderPushStatus>("/api/rider/push");

/** Can this browser subscribe at all? Null when it can. */
export const riderPushBlocker = (env: PushEnv = readPushEnv()): string | null =>
  pushBlocker(env);

export const riderNotificationPermission = (): NotificationPermission | "unsupported" =>
  readPermission();

/**
 * One tap: permission → browser subscription → server. The permission prompt
 * is the first thing that happens so it stays inside the tap's user
 * activation (Chrome refuses prompts nothing asked for).
 */
export const startRiderPushSetup = async (): Promise<RiderPushResult> => {
  const env = readPushEnv();
  const blocked = pushBlocker(env);
  if (blocked) {
    return {
      ok: false,
      reason: env.inApp ? "in-app" : env.https ? "unsupported" : "insecure",
      message: blocked,
    };
  }

  let status: RiderPushStatus;
  try {
    status = await fetchRiderPushStatus();
  } catch (err) {
    return { ok: false, reason: "save-failed", message: err instanceof Error ? err.message : "" };
  }
  if (!status.configured || !status.publicKey) {
    return { ok: false, reason: "unconfigured" };
  }
  if (!status.tableReady) {
    return {
      ok: false,
      reason: "save-failed",
      message:
        "push_subscriptions table / rider_id column nai — SQL Editor e supabase/migrations/202609250001_rider_dispatch_fix.sql chalaben.",
    };
  }

  const permission = await ensurePermission();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };

  try {
    const { sub } = await ensureSubscription(status.publicKey);
    await readJson("/api/rider/push", {
      method: "POST",
      body: JSON.stringify(subscriptionJson(sub)),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "save-failed", message: err instanceof Error ? err.message : "" };
  }
};

/** Turn it off: forget the row (the browser subscription may stay). */
export const stopRiderPush = async (): Promise<void> => {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await readJson("/api/rider/push", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: sub?.endpoint ?? "" }),
    });
    await sub?.unsubscribe();
  } catch {
    // Turning a bonus feature off must never throw at the rider.
  }
};
