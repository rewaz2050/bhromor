// @vitest-environment jsdom
/**
 * Browser half of the phone-notification pipeline (owner report 2026-09-23:
 * "Notification on korte partesi na", Nothing CMF Phone 2 Pro).
 *
 * These are the four states the owner can land in, each asserted against a
 * stubbed browser: an in-app browser (WhatsApp WebView — can never push), a
 * sticky "denied" permission (needs hand-written recovery steps), a browser
 * that already holds a subscription (re-save, never re-prompt), and a stale
 * subscription bound to a rotated VAPID key (must be replaced, not thrown).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Nothing Phone (2a)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const WHATSAPP_UA = `${ANDROID_UA} WhatsApp/2.24.1`;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const setUa = (ua: string) => {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
};

/** Minimal PushSubscription stand-in. */
const fakeSubscription = (key: BufferSource) => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/phone-1",
  options: { applicationServerKey: key },
  toJSON: () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/phone-1",
    keys: { p256dh: "pkey", auth: "authkey" },
  }),
  unsubscribe: vi.fn(async () => true),
});

const installedSub: { sub: ReturnType<typeof fakeSubscription> | null } = { sub: null };
const subscribeCalls: { applicationServerKey?: unknown }[] = [];
const shownNotices: { title: string; options?: NotificationOptions }[] = [];

/** Install a Chrome-on-Android-like environment. */
const installBrowser = (opts: { permission?: NotificationPermission } = {}) => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
  class FakeNotification {
    static permission: NotificationPermission = opts.permission ?? "default";
    /** Models a human tapping "Allow" on the prompt. */
    static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
      FakeNotification.permission = "granted";
      return FakeNotification.permission;
    });
  }
  Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });

  const registration = {
    pushManager: {
      getSubscription: async () => installedSub.sub,
      subscribe: async (options: { applicationServerKey?: unknown }) => {
        subscribeCalls.push(options);
        const sub = fakeSubscription(options.applicationServerKey as BufferSource);
        installedSub.sub = sub;
        return sub;
      },
    },
    showNotification: vi.fn(async (title: string, options?: NotificationOptions) => {
      shownNotices.push({ title, options });
      return undefined;
    }),
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      register: async () => registration,
      getRegistration: async () => registration,
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
  return { FakeNotification, registration };
};

const api = vi.hoisted(() => ({
  gets: [] as string[],
  posts: [] as { path: string; body: unknown }[],
  status: {
    configured: true,
    publicKey: "BEl_test_key",
    count: 0,
    tableReady: true,
  } as { configured: boolean; publicKey: string | null; count: number; tableReady: boolean },
}));

vi.mock("../admin-api", () => ({
  apiGet: async (path: string) => {
    api.gets.push(path);
    return api.status;
  },
  apiSend: async (path: string, _method: string, body?: unknown) => {
    api.posts.push({ path, body });
    return { ok: true };
  },
  apiErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong — please try again.",
}));

import {
  currentSubscription,
  detectInAppBrowser,
  detectPlatform,
  ensurePermission,
  pushBlocker,
  readPushEnv,
  recoverySteps,
  removeThisDevice,
  saveThisDevice,
  showPanelNotice,
  startPushSetup,
  urlBase64ToUint8Array,
} from "../push-client";

beforeEach(() => {
  api.gets.length = 0;
  api.posts.length = 0;
  api.status = { configured: true, publicKey: "BEl_test_key", count: 0, tableReady: true };
  installedSub.sub = null;
  subscribeCalls.length = 0;
  shownNotices.length = 0;
  setUa(ANDROID_UA);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("push-client — environment detection", () => {
  it("names the in-app browser instead of pretending to support push", () => {
    installBrowser({ permission: "default" });
    expect(detectInAppBrowser(WHATSAPP_UA)).toBe("WhatsApp");
    expect(detectInAppBrowser(ANDROID_UA)).toBeNull();
    expect(detectPlatform(ANDROID_UA)).toBe("android");
    expect(detectPlatform(IPHONE_UA)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");

    const env = { ...readPushEnv(), inApp: "WhatsApp" };
    expect(pushBlocker(env)).toContain("WhatsApp");
    expect(pushBlocker(readPushEnv())).toBeNull(); // a real Chrome on Android is fine
  });

  it("blocks an http origin — Web Push only exists on https", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    Object.defineProperty(window, "location", {
      value: { protocol: "http:", hostname: "localhost" },
      configurable: true,
    });
    // localhost is exempted; a real http host is not.
    expect(pushBlocker({ ...readPushEnv(), https: false })).toContain("https");
  });

  it("hands the owner the Android recovery path for a sticky 'denied'", () => {
    installBrowser({ permission: "denied" });
    const steps = recoverySteps(readPushEnv(), "denied");
    expect(steps.join("\n")).toContain("site settings");
    expect(steps.join("\n")).toContain("Chrome");
    // Nothing OS: the Chrome app itself must be allowed + unrestricted.
    expect(steps.join("\n")).toContain("Notifications");
    expect(steps.join("\n")).toContain("Unrestricted");
    // Nothing to recover when permission is fine.
    expect(recoverySteps(readPushEnv(), "granted")).toEqual([]);
  });

  it("gives iPhone the Add-to-Home-Screen answer", () => {
    installBrowser({ permission: "denied" });
    setUa(IPHONE_UA);
    const steps = recoverySteps(readPushEnv(), "denied").join("\n");
    expect(steps).toContain("Settings");
    expect(steps).toContain("Home Screen");
  });
});

describe("push-client — enabling the phone", () => {
  it("asks permission first, subscribes, and saves the endpoint", async () => {
    const { FakeNotification } = installBrowser({ permission: "default" });
    const result = await startPushSetup();

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(api.gets).toEqual(["/api/admin/push"]);
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0].path).toBe("/api/admin/push");
    expect(api.posts[0].body).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/phone-1",
      keys: { p256dh: "pkey", auth: "authkey" },
    });
    expect(result).toMatchObject({ ok: true, resubscribed: true });
  });

  it("reuses an existing subscription instead of creating a second one", async () => {
    installBrowser({ permission: "granted" });
    installedSub.sub = fakeSubscription(urlBase64ToUint8Array("BEl_test_key"));
    const result = await saveThisDevice(api.status);
    expect(subscribeCalls).toHaveLength(0);
    expect(result).toMatchObject({ ok: true, resubscribed: false });
    expect(api.posts).toHaveLength(1);
  });

  it("replaces a subscription bound to a rotated VAPID key (never throws)", async () => {
    installBrowser({ permission: "granted" });
    const stale = fakeSubscription(urlBase64ToUint8Array("BEl_OLD_key"));
    installedSub.sub = stale;
    const result = await saveThisDevice(api.status);
    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeCalls).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, resubscribed: true });
  });

  it("refuses to ask again when the browser says 'denied'", async () => {
    const { FakeNotification } = installBrowser({ permission: "denied" });
    const result = await startPushSetup();
    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(api.posts).toHaveLength(0);
  });

  it("reports a dismissed prompt as dismissed, not as success", async () => {
    const { FakeNotification } = installBrowser({ permission: "default" });
    FakeNotification.requestPermission.mockResolvedValueOnce(
      "default" as NotificationPermission,
    );
    expect(await startPushSetup()).toEqual({ ok: false, reason: "dismissed" });
    expect(api.posts).toHaveLength(0);
  });

  it("never calls requestPermission twice when it is already granted", async () => {
    const { FakeNotification } = installBrowser({ permission: "granted" });
    await ensurePermission();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("stays honest when the server has no VAPID keys", async () => {
    installBrowser({ permission: "granted" });
    api.status = { configured: false, publicKey: null, count: 0, tableReady: false };
    expect(await saveThisDevice(api.status)).toEqual({ ok: false, reason: "unconfigured" });
    expect(api.posts).toHaveLength(0);
  });

  it("drops the subscription and the server row on Off", async () => {
    installBrowser({ permission: "granted" });
    const sub = fakeSubscription(urlBase64ToUint8Array("BEl_test_key"));
    installedSub.sub = sub;
    expect(await currentSubscription()).toBe(sub);
    await removeThisDevice();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(api.posts[0]).toMatchObject({
      path: "/api/admin/push",
      body: { endpoint: "https://fcm.googleapis.com/fcm/send/phone-1" },
    });
  });
});

describe("push-client — in-panel alerts", () => {
  it("shows the alert through the service worker (mobile Chrome has no Notification constructor)", async () => {
    installBrowser({ permission: "granted" });
    await showPanelNotice("New order PS-1", "৳1,240 · COD", "/admin/orders/PS-1");
    expect(shownNotices).toHaveLength(1);
    expect(shownNotices[0].title).toBe("New order PS-1");
    expect(shownNotices[0].options).toMatchObject({
      body: "৳1,240 · COD",
      data: { href: "/admin/orders/PS-1" },
    });
  });
});
