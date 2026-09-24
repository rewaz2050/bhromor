"use client";

/**
 * Browser half of the staff Web Push pipeline (owner report 2026-09-23:
 * "Notification on korte partesi na" — Nothing CMF Phone 2 Pro, Android).
 *
 * Why this module exists: the old PushSetup did the whole flow inline and
 * could only report success/failure in one blunt sentence. On a real
 * Android phone there are four *different* reasons the ON button does
 * nothing or the toggle never lands, and each one needs different words:
 *
 *   1. server has no VAPID keys          → nothing to subscribe to;
 *   2. this browser cannot push          → Chrome WebView (WhatsApp /
 *      Messenger / Facebook in-app browser), http origin, no PushManager;
 *   3. Notification permission is
 *      "denied" (sticky!)                 → the browser never asks again —
 *      it must be reset by hand in Chrome's site settings, and on Android
 *      13+ the *Chrome app* needs notification permission too;
 *   4. permission granted but the
 *      subscription is missing/stale     → re-subscribe (no prompt) and
 *      re-save the endpoint.
 *
 * Everything here is a thin, testable wrapper over browser APIs: no React,
 * no network. `startPushSetup()` is the one call a tap handler makes.
 */

import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export type PushPlatform = "android" | "ios" | "desktop";

export interface PushEnv {
  /** Secure context — Web Push only exists on https (or localhost). */
  https: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** True when the panel is installed to the home screen. */
  standalone: boolean;
  platform: PushPlatform;
  /** Name of the in-app browser, e.g. "WhatsApp" — null in a real browser. */
  inApp: string | null;
}

export interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  count: number;
  /** False when migration 202609210001 was never applied to the database. */
  tableReady?: boolean;
}

export type PushFailure =
  | "unsupported"
  | "insecure"
  | "in-app"
  | "denied"
  | "dismissed"
  | "unconfigured"
  | "save-failed";

export type PushSetupResult =
  | { ok: true; endpoint: string; resubscribed: boolean }
  | { ok: false; reason: PushFailure; message?: string };

/**
 * In-app browsers (Facebook, Instagram, WhatsApp, TikTok, LINE, Google app)
 * run a WebView: the Notification permission request is refused outright
 * (cross-origin iframe without `allow="notifications"`), service workers are
 * restricted, and even a granted subscription would never display. Send the
 * owner to Chrome instead of failing silently.
 */
const IN_APP_MARKERS: [RegExp, string][] = [
  [/FB_IAB|FBAN|FBAV|FBSV/i, "Facebook"],
  [/Instagram/i, "Instagram"],
  [/\bMessenger\b/i, "Messenger"],
  [/WhatsApp/i, "WhatsApp"],
  [/Line\//i, "LINE"],
  [/TikTok|BytedanceWebview|musical_ly/i, "TikTok"],
  [/Twitter/i, "X"],
  [/GSA\//i, "Google app"],
  [/Snapchat/i, "Snapchat"],
  [/; wv\)/i, "an in-app browser"],
];

/** Pure: which in-app browser is this user agent? (null = a real browser) */
export const detectInAppBrowser = (userAgent: string): string | null => {
  for (const [pattern, name] of IN_APP_MARKERS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
};

/** Pure: android | ios | desktop from a user agent. */
export const detectPlatform = (userAgent: string): PushPlatform => {
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  return "desktop";
};

/** Read the browser's push capabilities. Client-only (call from an effect). */
export const readPushEnv = (): PushEnv => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      https: false,
      serviceWorker: false,
      pushManager: false,
      notification: false,
      standalone: false,
      platform: "desktop",
      inApp: null,
    };
  }
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    https:
      window.isSecureContext === true ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost",
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    standalone,
    platform: detectPlatform(ua),
    inApp: detectInAppBrowser(ua),
  };
};

/** Current permission, or "unsupported" when the API is not there at all. */
export const readPermission = (): NotificationPermission | "unsupported" => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
};

/** Can this browser subscribe at all? Null when it can. */
export const pushBlocker = (env: PushEnv): string | null => {
  if (!env.https) {
    return "Ei page ta https chara khulche — Web Push sudhu https e kaj kore.";
  }
  if (env.inApp) {
    return `Ei page ta ${env.inApp} er bhitore khulche. In-app browser e notification kono din asbe na — Chrome (ba Firefox) e kholun.`;
  }
  if (!env.notification || !env.pushManager || !env.serviceWorker) {
    return "Ei browser e Web Push support nai — Chrome (Android) ba iPhone e Add to Home Screen kora Safari lagbe.";
  }
  return null;
};

/** True when this device could be subscribed right now. */
export const pushSupported = (env: PushEnv): boolean => pushBlocker(env) === null;

/**
 * Hand-written recovery steps for a sticky "denied" permission — the one
 * state the site itself cannot undo. Android 13+ has TWO switches (Chrome
 * the app, and the site inside Chrome) and Nothing OS adds its own battery
 * restriction, which is where pushes silently die.
 */
export const recoverySteps = (
  env: PushEnv,
  permission: NotificationPermission | "unsupported",
): string[] => {
  if (permission !== "denied") return [];
  if (env.platform === "ios") {
    return [
      "iPhone: Settings → Notifications → PROSANTI → Allow Notifications ON korun.",
      "Safari te khule thakle: Settings → Apps → Safari → Notifications check korun.",
      "Panel ta “Add to Home Screen” kora thakle e (iOS 16.4+) web push kaj kore.",
    ];
  }
  if (env.platform === "android") {
    return [
      "Chrome e site ta kholun → address bar-er 🔒 (site settings) → Permissions → Notifications → Allow.",
      "Na paile: Chrome → ⋮ → Settings → Site settings → Notifications → “Not allowed” list theke ei site ta soran, tarpor panel refresh korun.",
      "Chrome app-er notification bondho thakle kichui asbe na: Phone Settings → Apps → Chrome → Notifications → ON (Nothing OS: App info → Notifications → “Sites”/“General” ON korun).",
      "Battery saver push atkay: Phone Settings → Apps → Chrome → Battery → Unrestricted.",
    ];
  }
  return [
    "Address bar-er 🔒 (site settings) → Notifications → Allow, tarpor page ta refresh korun.",
    "Na paile: chrome://settings/content/notifications e giye “Not allowed to send notifications” list theke site ta bad din.",
  ];
};

/** URL-safe base64 (VAPID public key) → the Uint8Array subscribe() wants. */
export const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  // Allocated over a real ArrayBuffer so the result is a valid BufferSource
  // for pushManager.subscribe (TS 5.7 typed arrays over ArrayBufferLike are not).
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

const bufferToBase64Url = (buffer: BufferSource | null | undefined): string => {
  if (!buffer) return "";
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The subscription this browser already holds (null when none). */
export const currentSubscription = async (): Promise<PushSubscription | null> => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub ?? null;
  } catch {
    return null;
  }
};

/** True when this browser holds a live push subscription. */
export const hasLocalSubscription = async (): Promise<boolean> =>
  (await currentSubscription()) !== null;

/**
 * Register the service worker and return a subscription for `publicKey`.
 *
 * A subscription is bound to the key it was created with: if the owner ever
 * regenerates the VAPID pair, `subscribe()` throws InvalidStateError on the
 * old row. Detect the mismatch, drop the stale subscription and make a new
 * one instead of surfacing a cryptic DOM exception.
 */
const ensureSubscription = async (
  publicKey: string,
): Promise<{ sub: PushSubscription; resubscribed: boolean }> => {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(publicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const sameKey =
      bufferToBase64Url(existing.options.applicationServerKey) ===
      bufferToBase64Url(key);
    if (sameKey) return { sub: existing, resubscribed: false };
    await existing.unsubscribe();
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  return { sub, resubscribed: true };
};

const subscriptionJson = (
  sub: PushSubscription,
): { endpoint?: string; keys?: { p256dh?: string; auth?: string } } =>
  sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/**
 * Ask the browser for permission. MUST be reached from a tap: Chrome refuses
 * (and counts against the site) a permission prompt that no one asked for.
 * An already-granted/denied permission is returned as-is — the prompt is not
 * shown twice.
 */
export const ensurePermission = async (): Promise<
  NotificationPermission | "unsupported"
> => {
  const current = readPermission();
  if (current !== "default") return current;
  try {
    return await Notification.requestPermission();
  } catch {
    return "unsupported";
  }
};

/**
 * Subscribe this device and store the endpoint server-side. Never asks for
 * permission — call `ensurePermission()` from the tap first, or use
 * `startPushSetup()`.
 */
export const saveThisDevice = async (
  status: PushStatus,
): Promise<PushSetupResult> => {
  if (!status.configured || !status.publicKey) {
    return { ok: false, reason: "unconfigured" };
  }
  const env = readPushEnv();
  const blocked = pushBlocker(env);
  if (blocked) {
    return { ok: false, reason: env.inApp ? "in-app" : env.https ? "unsupported" : "insecure", message: blocked };
  }
  try {
    const { sub, resubscribed } = await ensureSubscription(status.publicKey);
    const json = subscriptionJson(sub);
    await apiSend("/api/admin/push", "POST", json);
    return { ok: true, endpoint: json.endpoint ?? "", resubscribed };
  } catch (err) {
    return { ok: false, reason: "save-failed", message: apiErrorMessage(err) };
  }
};

/**
 * One tap: permission → subscription → server. The permission prompt is the
 * first thing that happens so it stays inside the tap's user activation.
 */
export const startPushSetup = async (): Promise<PushSetupResult> => {
  const permission = await ensurePermission();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };
  let status: PushStatus;
  try {
    status = await apiGet<PushStatus>("/api/admin/push");
  } catch (err) {
    return { ok: false, reason: "save-failed", message: apiErrorMessage(err) };
  }
  return saveThisDevice(status);
};

/** Stop this device: drop the browser subscription and forget the row. */
export const removeThisDevice = async (): Promise<void> => {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await apiSend("/api/admin/push", "DELETE", { endpoint });
};

/**
 * In-panel alert ("panel khola thakle beep-o bajbe").
 *
 * `new Notification()` is an illegal constructor on **every** mobile Chrome
 * ("Use ServiceWorkerRegistration.showNotification() instead"), so the old
 * code silently showed nothing on the owner's phone. Prefer the service
 * worker (works on Android and iOS PWAs), fall back to the constructor for
 * desktop browsers without a registration.
 */
export const showPanelNotice = async (
  title: string,
  body: string,
  href = "/admin",
): Promise<void> => {
  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: href,
    data: { href },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    if (reg && typeof reg.showNotification === "function") {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // fall through to the constructor
  }
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(title, options);
  } catch {
    // Desktop-only API; Android throws here by design.
  }
};
