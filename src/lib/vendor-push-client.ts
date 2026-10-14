"use client";

/**
 * Browser half of vendor (shop) Web Push (migration 202610020018). Same service worker and
 * VAPID key as the staff and rider pipelines; talks to `/api/vendor/push` (vendor session).
 * Messages are English (the vendor panel is English).
 */

import { vendorErrorMessage, vendorGet, vendorSend } from "./use-vendor";
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

export interface VendorPushStatus {
  configured: boolean;
  publicKey: string | null;
  /** False when migration 202610020018 has not run. */
  tableReady: boolean;
  /** Devices this shop has registered. */
  count: number;
}

export type VendorPermission = NotificationPermission | "unsupported";

/** Why this phone cannot receive pushes at all (null = it can). */
export const vendorPushBlocker = (env: PushEnv): string | null => {
  if (!env.https) return "This page is not on https — notifications only work on https.";
  if (env.nativeApp) {
    // No PushManager in Android's WebView — Web Push cannot register here.
    return "The PROSANTI app cannot receive Web Push (Android's WebView has no PushManager). Open the panel in Chrome, or add it to the home screen.";
  }
  if (env.inApp) {
    return `You opened the panel inside ${env.inApp} — notifications do not arrive there. Open it in Chrome.`;
  }
  if (env.platform === "ios" && !env.standalone) {
    return "On iPhone: tap Share → “Add to Home Screen”, then open the panel from the home screen.";
  }
  if (!env.notification || !env.pushManager || !env.serviceWorker) {
    return "This browser cannot show notifications — use Chrome on Android or desktop.";
  }
  return null;
};

export const vendorRecoverySteps = (env: PushEnv, permission: VendorPermission): string[] => {
  if (permission !== "denied") return [];
  if (env.platform === "ios") {
    return [
      "Settings → Notifications → PROSANTI → Allow Notifications.",
      "Open the panel from the home screen (not a Safari tab).",
    ];
  }
  return [
    "In Chrome tap the 🔒 next to the address → Permissions → Notifications → Allow.",
    "Check Settings → Apps → Chrome → Notifications is on, and Battery is “Unrestricted”.",
    "Then refresh this page.",
  ];
};

export const fetchVendorPushStatus = (): Promise<VendorPushStatus> =>
  vendorGet<VendorPushStatus>("/api/vendor/push");

const registerDevice = async (status: VendorPushStatus): Promise<PushSetupResult> => {
  if (!status.configured || !status.publicKey) return { ok: false, reason: "unconfigured" };
  if (!status.tableReady) {
    return { ok: false, reason: "save-failed", message: "Notifications are not set up yet — tell PROSANTI." };
  }
  try {
    const { sub, resubscribed } = await ensureSubscription(status.publicKey);
    const json = subscriptionJson(sub);
    await vendorSend("/api/vendor/push", "POST", json);
    return { ok: true, endpoint: json.endpoint ?? "", resubscribed };
  } catch (err) {
    return { ok: false, reason: "save-failed", message: vendorErrorMessage(err) };
  }
};

/** One tap: permission → subscription → server. */
export const enableVendorPush = async (): Promise<PushSetupResult> => {
  const permission = await ensurePermission();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };
  let status: VendorPushStatus;
  try {
    status = await fetchVendorPushStatus();
  } catch (err) {
    return { ok: false, reason: "save-failed", message: vendorErrorMessage(err) };
  }
  return registerDevice(status);
};

/** Silent repair (no prompt): permission already granted → re-save the current endpoint. */
export const repairVendorPush = async (status: VendorPushStatus): Promise<PushSetupResult> =>
  readPermission() === "granted" ? registerDevice(status) : { ok: false, reason: "dismissed" };

export const disableVendorPush = async (): Promise<void> => {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await vendorSend("/api/vendor/push", "DELETE", { endpoint });
};

export const readVendorLocalPush = async (): Promise<{
  env: PushEnv;
  permission: VendorPermission;
  subscribed: boolean;
}> => {
  const env = readPushEnv();
  const permission = readPermission();
  const subscribed = env.serviceWorker ? (await currentSubscription()) !== null : false;
  return { env, permission, subscribed };
};
