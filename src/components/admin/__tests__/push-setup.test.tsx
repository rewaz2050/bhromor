// @vitest-environment jsdom
/**
 * The phone-notification card on /admin/notifications (owner report
 * 2026-09-23: "ami notification on korte partesi na").
 *
 * The old card had one button and one sentence, so "no VAPID keys", "opened
 * in WhatsApp", "permission was blocked" and "this browser was never
 * registered" all looked the same. These tests pin the checklist: each state
 * names itself, the blocked state prints recovery steps, and the ON tap runs
 * the real setup flow.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  status: {
    configured: true,
    publicKey: "BEl_test_key",
    count: 0,
    tableReady: true,
  } as {
    configured: boolean;
    publicKey: string | null;
    count: number;
    tableReady: boolean;
  },
  env: {
    https: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    standalone: false,
    platform: "android" as "android" | "ios" | "desktop",
    inApp: null as string | null,
  },
  permission: "default" as NotificationPermission | "unsupported",
  subscribed: false,
  saveCalls: 0,
  setupCalls: 0,
  removeCalls: 0,
  testPushes: 0,
}));

vi.mock("@/lib/admin-api", () => ({
  apiGet: async () => state.status,
  apiSend: async (path: string) => {
    if (path === "/api/admin/push/test") state.testPushes += 1;
    return { ok: true };
  },
  apiErrorMessage: () => "Something went wrong.",
}));

vi.mock("@/lib/push-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push-client")>(
    "@/lib/push-client",
  );
  return {
    ...actual,
    readPushEnv: () => state.env,
    readPermission: () => state.permission,
    currentSubscription: async () => (state.subscribed ? ({} as PushSubscription) : null),
    saveThisDevice: async () => {
      state.saveCalls += 1;
      state.subscribed = true;
      return { ok: true, endpoint: "https://push/x", resubscribed: true };
    },
    startPushSetup: async () => {
      state.setupCalls += 1;
      state.subscribed = true;
      state.permission = "granted";
      return { ok: true, endpoint: "https://push/x", resubscribed: true };
    },
    removeThisDevice: async () => {
      state.removeCalls += 1;
      state.subscribed = false;
    },
  };
});

import PushSetup from "../push-setup";

const reset = () => {
  state.status = { configured: true, publicKey: "BEl_test_key", count: 0, tableReady: true };
  state.env = {
    https: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    standalone: false,
    platform: "android",
    inApp: null,
  };
  state.permission = "default";
  state.subscribed = false;
  state.saveCalls = 0;
  state.setupCalls = 0;
  state.removeCalls = 0;
  state.testPushes = 0;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PushSetup card", () => {
  it("explains the missing VAPID keys instead of offering a dead button", async () => {
    reset();
    state.status = { configured: false, publicKey: null, count: 0, tableReady: false };
    render(<PushSetup />);

    await waitFor(() =>
      expect(screen.getByTestId("push-setup").dataset.state).toBe("unconfigured"),
    );
    expect(screen.getByText(/PUSH_VAPID_PUBLIC_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/generate-vapid-keys/)).toBeInTheDocument();
    expect(screen.queryByTestId("push-enable")).not.toBeInTheDocument();
  });

  it("names every blocker in the checklist — keys, table, browser, permission, device", async () => {
    reset();
    state.status = { configured: true, publicKey: "BEl", count: 3, tableReady: false };
    state.env = { ...state.env, inApp: "WhatsApp" };
    render(<PushSetup />);

    await waitFor(() => expect(screen.getByTestId("push-checks")).toBeInTheDocument());
    expect(screen.getByTestId("push-check-server").dataset.ok).toBe("1");
    expect(screen.getByTestId("push-check-db").dataset.ok).toBe("0");
    expect(screen.getByTestId("push-check-db").textContent).toContain("202609210001_push_subscriptions.sql");
    expect(screen.getByTestId("push-check-browser").dataset.ok).toBe("0");
    expect(screen.getByTestId("push-check-browser").textContent).toContain("WhatsApp");
    // A WebView can never subscribe: no dead ON button, just a re-check.
    expect(screen.queryByTestId("push-enable")).not.toBeInTheDocument();
    expect(screen.getByTestId("push-recheck")).toBeInTheDocument();
    // 3 devices on the server, none of them this browser → say so out loud.
    expect(screen.getByTestId("push-other-devices").textContent).toContain("3 ta device");
  });

  it("keeps the ON button disabled until the device table exists", async () => {
    reset();
    state.status = { configured: true, publicKey: "BEl", count: 0, tableReady: false };
    render(<PushSetup />);

    await waitFor(() => expect(screen.getByTestId("push-enable")).toBeInTheDocument());
    expect(screen.getByTestId("push-enable")).toBeDisabled();
    expect(screen.getByTestId("push-check-db").dataset.ok).toBe("0");
  });

  it("prints the hand-set recovery steps when the browser blocked the site", async () => {
    reset();
    state.permission = "denied";
    render(<PushSetup />);

    await waitFor(() => expect(screen.getByTestId("push-recovery")).toBeInTheDocument());
    const recovery = screen.getByTestId("push-recovery").textContent ?? "";
    expect(recovery).toContain("site settings");
    expect(recovery).toContain("Unrestricted"); // Nothing OS battery note
    expect(screen.getByTestId("push-check-permission").dataset.ok).toBe("0");
    // A blocked site can not be re-prompted: the primary action is a re-check,
    // not a button that silently does nothing.
    expect(screen.queryByTestId("push-enable")).not.toBeInTheDocument();
    expect(screen.getByTestId("push-recheck")).toBeInTheDocument();
  });

  it("turns the phone on with one tap and then offers the test push", async () => {
    reset();
    render(<PushSetup />);
    await waitFor(() => expect(screen.getByTestId("push-enable")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("push-enable"));
    await waitFor(() => expect(screen.getByTestId("push-note")).toBeInTheDocument());
    expect(state.setupCalls).toBe(1);
    expect(screen.getByTestId("push-check-device").dataset.ok).toBe("1");

    fireEvent.click(screen.getByTestId("push-test"));
    await waitFor(() => expect(state.testPushes).toBe(1));
    expect(screen.getByTestId("push-note").textContent).toContain("Test pathano holo");
  });

  it("re-saves this device on open when permission is already granted (self-heal, no prompt)", async () => {
    reset();
    state.permission = "granted";
    state.subscribed = false;
    render(<PushSetup />);

    await waitFor(() => expect(state.saveCalls).toBe(1));
    expect(state.setupCalls).toBe(0); // never re-prompt through startPushSetup
    expect(screen.getByTestId("push-note").textContent).toContain("abar jora lagano holo");
  });

  it("offers Test + Off once this browser holds a subscription", async () => {
    reset();
    state.permission = "granted";
    state.subscribed = true;
    render(<PushSetup />);

    await waitFor(() => expect(screen.getByTestId("push-test")).toBeInTheDocument());
    expect(screen.getByTestId("push-check-device").dataset.ok).toBe("1");
    expect(screen.queryByTestId("push-enable")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("push-disable"));
    await waitFor(() => expect(state.removeCalls).toBe(1));
    expect(screen.getByTestId("push-note").textContent).toContain("off kora holo");
  });
});
