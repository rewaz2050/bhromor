"use client";

/**
 * Browser half of rider Web Push (item I). Mirrors the staff pipeline in
 * `push-client.ts` (same service worker, same VAPID key) with two differences:
 * it talks to `/api/rider/push` (rider session, not staff) and every message a
 * rider can see is in Bangla.
 */

import { riderErrorMessage, riderFetch } from "./use-rider";
import {
  currentSubscription,
  ensurePermission,
  ensureSubscription,
  readPermission,
  readPushEnv,
  subscriptionJson,
  type PushEnv,
  type PushSetupResult,
} from "./push-client";

export interface RiderPushStatus {
  configured: boolean;
  publicKey: string | null;
  /** False when migration 202610020004 has not run. */
  tableReady: boolean;
  /** Devices this rider has registered. */
  count: number;
}

export type Permission = NotificationPermission | "unsupported";

/** Why this phone cannot receive pushes at all (null = it can). */
export const riderPushBlocker = (env: PushEnv): string | null => {
  if (!env.https) return "এই পেজ https ছাড়া খুলেছে — নোটিফিকেশন শুধু https-এ কাজ করে।";
  if (env.inApp) {
    return `আপনি ${env.inApp}-এর ভেতরে অ্যাপ খুলেছেন — সেখানে নোটিফিকেশন আসে না। Chrome-এ খুলুন।`;
  }
  if (env.platform === "ios" && !env.standalone) {
    return "iPhone-এ নোটিফিকেশনের জন্য Safari-র শেয়ার বাটন → “Add to Home Screen” করে সেখান থেকে অ্যাপ খুলুন।";
  }
  if (!env.notification || !env.pushManager || !env.serviceWorker) {
    return "এই ব্রাউজারে নোটিফিকেশন চলে না — Android-এ Chrome ব্যবহার করুন।";
  }
  return null;
};

/** Hand-written steps for a sticky "denied" permission. */
export const riderRecoverySteps = (env: PushEnv, permission: Permission): string[] => {
  if (permission !== "denied") return [];
  if (env.platform === "ios") {
    return [
      "Settings → Notifications → PROSANTI → Allow Notifications চালু করুন।",
      "অ্যাপটি Home Screen থেকে খুলুন (Safari ট্যাব থেকে নয়)।",
    ];
  }
  return [
    "Chrome-এ এই সাইট খুলে ঠিকানার পাশের 🔒 চাপুন → Permissions → Notifications → Allow।",
    "ফোনের Settings → Apps → Chrome → Notifications চালু আছে কিনা দেখুন।",
    "ব্যাটারি সেভার নোটিফিকেশন আটকায়: Settings → Apps → Chrome → Battery → Unrestricted।",
    "ঠিক করে এই পেজ রিফ্রেশ করুন।",
  ];
};

export const fetchRiderPushStatus = (): Promise<RiderPushStatus> =>
  riderFetch<RiderPushStatus>("/api/rider/push");

/** Subscribe this device (no permission prompt) and register it for the session rider. */
const registerDevice = async (status: RiderPushStatus): Promise<PushSetupResult> => {
  if (!status.configured || !status.publicKey) return { ok: false, reason: "unconfigured" };
  if (!status.tableReady) {
    return { ok: false, reason: "save-failed", message: "নোটিফিকেশন এখনো চালু হয়নি — অফিসকে জানান।" };
  }
  try {
    const { sub, resubscribed } = await ensureSubscription(status.publicKey);
    const json = subscriptionJson(sub);
    await riderFetch("/api/rider/push", "POST", json);
    return { ok: true, endpoint: json.endpoint ?? "", resubscribed };
  } catch (err) {
    return { ok: false, reason: "save-failed", message: riderErrorMessage(err) };
  }
};

/** One tap: permission → subscription → server. The prompt stays inside the tap. */
export const enableRiderPush = async (): Promise<PushSetupResult> => {
  const permission = await ensurePermission();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };
  let status: RiderPushStatus;
  try {
    status = await fetchRiderPushStatus();
  } catch (err) {
    return { ok: false, reason: "save-failed", message: riderErrorMessage(err) };
  }
  return registerDevice(status);
};

/**
 * Silent repair (no prompt): permission already granted → make sure the
 * browser holds a subscription and the server has its current endpoint. A
 * rotated or pruned subscription heals the next time the rider opens the app.
 */
export const repairRiderPush = async (status: RiderPushStatus): Promise<PushSetupResult> =>
  readPermission() === "granted" ? registerDevice(status) : { ok: false, reason: "dismissed" };

export const disableRiderPush = async (): Promise<void> => {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await riderFetch("/api/rider/push", "DELETE", { endpoint });
};

export const readLocalPush = async (): Promise<{ env: PushEnv; permission: Permission; subscribed: boolean }> => {
  const env = readPushEnv();
  const permission = readPermission();
  const subscribed = env.serviceWorker ? (await currentSubscription()) !== null : false;
  return { env, permission, subscribed };
};
