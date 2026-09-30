// @vitest-environment jsdom
/**
 * The vendor dashboard's new-order ring (2026-09-27, Phase 2).
 *
 * What must stay true:
 *   • the first payload after a load never rings — nothing is "new" yet;
 *   • an order that appears while the dashboard is open rings ONCE, with the
 *     service-worker notification helper (mobile Chrome can't use `new
 *     Notification()`);
 *   • permission is asked from the shop's tap, never on mount;
 *   • turning the ring off stops it (the shop's choice is remembered).
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../orders";

const state = vi.hoisted(() => ({
  notices: [] as { title: string; body: string; href?: string }[],
  permission: "default" as NotificationPermission,
}));

vi.mock("../push-client", () => ({
  showPanelNotice: async (title: string, body: string, href?: string) => {
    state.notices.push({ title, body, href });
  },
}));

import { VENDOR_ALERT_KEY, useVendorOrderAlert } from "../use-vendor-order-alert";

const order = (id: string): Order =>
  ({
    id,
    createdAt: Date.now(),
    customer: { name: "Rima", phone: "01712345678" },
    items: [{ productId: "p1", name: "Panjabi", qty: 1, price: 120000 }],
    total: 126000,
    status: "pending",
    timeline: [],
  }) as unknown as Order;

const installNotification = (permission: NotificationPermission) => {
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
      FakeNotification.permission = "granted";
      state.permission = "granted";
      return "granted";
    });
  }
  Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  return FakeNotification;
};

beforeEach(() => {
  state.notices = [];
  window.localStorage.clear();
  installNotification("default");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useVendorOrderAlert", () => {
  it("never asks for permission on load", async () => {
    const Fake = installNotification("default");
    renderHook(() => useVendorOrderAlert([order("PS-1")], { enabled: true }));
    await waitFor(() => expect(Fake.requestPermission).not.toHaveBeenCalled());
  });

  it("stays silent for the orders already on screen at load", async () => {
    window.localStorage.setItem(VENDOR_ALERT_KEY, "on");
    installNotification("granted");
    const { rerender } = renderHook(
      ({ orders }: { orders: Order[] }) => useVendorOrderAlert(orders, { enabled: true }),
      { initialProps: { orders: [order("PS-1")] } },
    );
    rerender({ orders: [order("PS-1")] });
    expect(state.notices).toEqual([]);
  });

  it("rings when a NEW order arrives, through the service-worker notice", async () => {
    window.localStorage.setItem(VENDOR_ALERT_KEY, "on");
    installNotification("granted");
    const { rerender, result } = renderHook(
      ({ orders }: { orders: Order[] }) => useVendorOrderAlert(orders, { enabled: true }),
      { initialProps: { orders: [order("PS-1")] } },
    );
    await act(async () => {
      rerender({ orders: [order("PS-2"), order("PS-1")] });
    });
    await waitFor(() => expect(state.notices).toHaveLength(1));
    expect(state.notices[0].title).toContain("PS-2");
    expect(state.notices[0].href).toBe("/vendor/orders/PS-2");
    expect(result.current.state.lastRangAt).toBeTypeOf("number");
  });

  it("keeps quiet while the shop has the ring switched off", async () => {
    installNotification("granted");
    const { rerender, result } = renderHook(
      ({ orders }: { orders: Order[] }) => useVendorOrderAlert(orders, { enabled: true }),
      { initialProps: { orders: [order("PS-1")] } },
    );
    await waitFor(() => expect(result.current.state.armed).toBe(false));
    await act(async () => {
      rerender({ orders: [order("PS-2"), order("PS-1")] });
    });
    expect(state.notices).toEqual([]);
  });

  it("asks for permission only from the shop's tap and remembers the choice", async () => {
    const Fake = installNotification("default");
    const { result } = renderHook(() => useVendorOrderAlert([], { enabled: true }));
    await act(async () => {
      await result.current.enableAlerts();
    });
    expect(Fake.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.state.armed).toBe(true);
    expect(window.localStorage.getItem(VENDOR_ALERT_KEY)).toBe("on");

    act(() => result.current.disableAlerts());
    expect(result.current.state.armed).toBe(false);
    expect(window.localStorage.getItem(VENDOR_ALERT_KEY)).toBeNull();
  });

  it("sends a test notice that points at the order queue", async () => {
    installNotification("granted");
    const { result } = renderHook(() => useVendorOrderAlert([], { enabled: true }));
    await act(async () => {
      await result.current.testAlert();
    });
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].href).toBe("/vendor/orders");
  });
});
