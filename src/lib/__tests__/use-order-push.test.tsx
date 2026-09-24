// @vitest-environment jsdom
/**
 * The shopper's own push flow (2026-09-24).
 *
 * The card on /track is only as honest as this hook: it must ask permission
 * from the tap (never on load — that is the sticky "denied" bug the staff
 * card was rebuilt for), send the tracker's proof (order id + phone) with the
 * subscription, and refuse to claim success when the server said no.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Nothing Phone (2a)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const state = vi.hoisted(() => ({
  posts: [] as { url: string; body: Record<string, unknown> }[],
  status: { configured: true, publicKey: "BEl_test_key", ready: true, watching: 0 },
  statusOk: true,
  postOk: true,
  postError: "Could not save this device — please try again.",
  testSent: 2,
}));

const setUa = (ua: string) =>
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

vi.mock("../admin-api", () => ({
  apiErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong — please try again.",
}));

const installed = { sub: null as null | Record<string, unknown> };

const installBrowser = (permission: NotificationPermission) => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
      FakeNotification.permission = "granted";
      return "granted";
    });
  }
  Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  const registration = {
    pushManager: {
      getSubscription: async () => installed.sub,
      subscribe: async () => {
        const sub = {
          endpoint: "https://fcm.googleapis.com/fcm/send/shopper-1",
          toJSON: () => ({
            endpoint: "https://fcm.googleapis.com/fcm/send/shopper-1",
            keys: { p256dh: "pkey", auth: "authkey" },
          }),
          unsubscribe: vi.fn(async () => true),
        };
        installed.sub = sub;
        return sub;
      },
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      register: async () => registration,
      getRegistration: async () => registration,
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
  return { FakeNotification };
};

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === "POST" && path === "/api/track/push") {
      state.posts.push({ url: path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return {
        ok: state.postOk,
        status: state.postOk ? 200 : 422,
        json: async () => (state.postOk ? { ok: true } : { error: state.postError }),
      } as Response;
    }
    if (init?.method === "POST" && path === "/api/track/push/test") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, sent: state.testSent }),
      } as Response;
    }
    if (init?.method === "DELETE") return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    return {
      ok: state.statusOk,
      status: state.statusOk ? 200 : 503,
      json: async () => state.status,
    } as Response;
  }),
);

import { ORDER_PUSH_KEY, useOrderPush } from "../use-order-push";

beforeEach(() => {
  state.posts = [];
  state.status = { configured: true, publicKey: "BEl_test_key", ready: true, watching: 0 };
  state.statusOk = true;
  state.postOk = true;
  state.testSent = 2;
  installed.sub = null;
  setUa(ANDROID_UA);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useOrderPush", () => {
  it("never asks for permission on load — only from the tap", async () => {
    const { FakeNotification } = installBrowser("default");
    const { result } = renderHook(() => useOrderPush("PS-7", "01712345678"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(result.current.state.subscribed).toBe(false);
    expect(result.current.state.supported).toBe(true);
  });

  it("subscribes on the tap and sends the tracker's proof with the endpoint", async () => {
    installBrowser("default");
    const { result } = renderHook(() => useOrderPush("PS-7", "01712345678"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let outcome: { ok: boolean } = { ok: false };
    await act(async () => {
      outcome = await result.current.enable();
    });
    expect(outcome.ok).toBe(true);
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0].body).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/shopper-1",
      keys: { p256dh: "pkey", auth: "authkey" },
      id: "PS-7",
      phone: "01712345678",
      lang: "bn",
    });
    expect(result.current.state.subscribed).toBe(true);
    expect(window.localStorage.getItem(ORDER_PUSH_KEY)).toContain("shopper-1");
  });

  it("surfaces the server's own refusal (never a fake success)", async () => {
    installBrowser("granted");
    state.postOk = false;
    state.postError = "No order found — double-check the order ID and the phone number you ordered with.";
    const { result } = renderHook(() => useOrderPush("PS-7", "01899999999"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let outcome: { ok: boolean; message?: string } = { ok: true };
    await act(async () => {
      outcome = await result.current.enable();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("double-check");
  });

  it("stops before the network when the browser already blocked notifications", async () => {
    installBrowser("denied");
    const { result } = renderHook(() => useOrderPush("PS-7", "01712345678"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state.permission).toBe("denied");
    expect(result.current.state.steps.join("\n")).toContain("site settings");

    let outcome: { ok: boolean; message?: string } = { ok: true };
    await act(async () => {
      outcome = await result.current.enable();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("steps");
    expect(state.posts).toHaveLength(0);
  });

  it("sends the test through the server and reports how many devices it reached", async () => {
    installBrowser("granted");
    installed.sub = { endpoint: "https://fcm.googleapis.com/fcm/send/shopper-1" };
    const { result } = renderHook(() => useOrderPush("PS-7", "01712345678"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    await act(async () => {
      const ok = await result.current.sendTest();
      expect(ok.ok).toBe(true);
    });

    state.testSent = 0;
    await act(async () => {
      const none = await result.current.sendTest();
      expect(none.ok).toBe(false);
      expect(none.message).toContain("joma nai");
    });
  });

  it("turns the device off and forgets it locally", async () => {
    installBrowser("granted");
    const { result } = renderHook(() => useOrderPush("PS-7", "01712345678"));
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    window.localStorage.setItem(ORDER_PUSH_KEY, JSON.stringify({ endpoint: "https://x", orderId: "PS-7" }));

    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.state.subscribed).toBe(false);
    expect(window.localStorage.getItem(ORDER_PUSH_KEY)).toBeNull();
  });
});
