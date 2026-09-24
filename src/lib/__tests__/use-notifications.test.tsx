// @vitest-environment jsdom
/**
 * The staff inbox alert path (owner report 2026-09-23).
 *
 * Two Android-only defects lived here:
 *   1. the hook called Notification.requestPermission() on mount — an
 *      untapped prompt, which Chrome answers with a sticky "denied", so the
 *      owner's later tap on the setup card could never succeed;
 *   2. the alert used `new Notification(...)`, an illegal constructor on
 *      every mobile Chrome — so nothing ever appeared on the phone while the
 *      desktop thought it had alerted.
 *
 * Both are pinned below, together with the beep's AudioContext resume.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
  href?: string;
}

const state = vi.hoisted(() => ({
  notifications: [] as Row[],
  polls: 0,
}));

vi.mock("../use-staff-live", () => ({
  useStaffLive: () => ({ live: true, checked: true, error: null, retry: () => {} }),
}));

vi.mock("../admin-api", () => ({
  apiGet: async () => {
    state.polls += 1;
    return { notifications: state.notifications };
  },
  apiSend: async () => ({ ok: true }),
  apiErrorMessage: () => "Something went wrong.",
}));

const showPanelNotice = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../push-client", () => ({ showPanelNotice }));

const requestPermission = vi.fn(async () => "granted" as NotificationPermission);

/** Chrome-on-Android audio: the context starts suspended until a gesture. */
const audioContexts: { resume: ReturnType<typeof vi.fn>; state: string }[] = [];

import { useNotifications } from "../use-notifications";

const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  kind: "order",
  title: `Order ${id}`,
  body: "",
  at: 1,
  read: false,
  ...over,
});

beforeEach(() => {
  state.notifications = [];
  state.polls = 0;
  requestPermission.mockClear();
  showPanelNotice.mockClear();
  audioContexts.length = 0;

  Object.defineProperty(window, "Notification", {
    value: { permission: "granted", requestPermission },
    configurable: true,
  });
  class FakeAudioContext {
    state = "suspended";
    resume = vi.fn(async () => undefined);
    createOscillator = () => ({
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });
    createGain = () => ({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    });
    currentTime = 0;
    destination = {};
    constructor() {
      audioContexts.push(this);
    }
  }
  Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
  Object.defineProperty(window.navigator, "vibrate", { value: vi.fn(), configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useNotifications alerts", () => {
  it("never asks for notification permission without a tap", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(state.polls).toBeGreaterThan(0));
    await act(async () => {
      await result.current.refresh();
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("raises the alert through the service worker, not new Notification()", async () => {
    // First load: the hook learns the current unread count (no alert yet).
    state.notifications = [row("n1", { title: "Old" })];
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(state.polls).toBeGreaterThan(0));
    expect(showPanelNotice).not.toHaveBeenCalled();

    // Next poll: a new unread notice arrives → beep + alert.
    state.notifications = [
      row("n2", { title: "New order PS-9", body: "৳1,240 · COD", href: "/admin/orders/PS-9" }),
      ...state.notifications,
    ];
    await act(async () => {
      await result.current.refresh();
    });

    expect(showPanelNotice).toHaveBeenCalledTimes(1);
    expect(showPanelNotice).toHaveBeenCalledWith(
      "New order PS-9",
      "৳1,240 · COD",
      "/admin/orders/PS-9",
    );
    // The beep went through a context that mobile Chrome had left suspended.
    expect(audioContexts).toHaveLength(1);
    expect(audioContexts[0].resume).toHaveBeenCalled();
  });
});
