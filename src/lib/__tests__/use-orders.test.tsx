// @vitest-environment jsdom
/**
 * Admin order list pagination on the client (audit M5, 2026-09-16).
 * The hook loads the newest page, `loadMore` appends the next older page
 * via the server cursor, and the poll re-walks every opened page.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../orders";

const state = vi.hoisted(() => ({
  requests: [] as string[],
  pages: {} as Record<string, { orders: { id: string }[]; nextCursor: string | null }>,
  detail: null as { id: string } | null,
  detailStatus: 200,
}));

vi.mock("../use-staff-live", () => ({
  useStaffLive: () => ({ live: true, checked: true, error: null, retry: () => {} }),
}));

vi.mock("../admin-api", async () => {
  const actual = await vi.importActual<typeof import("../admin-api")>("../admin-api");
  return {
    ...actual,
    apiGet: async (path: string) => {
      state.requests.push(path);
      const url = new URL(path, "http://x");
      if (url.pathname === "/api/admin/orders") {
        const key = url.searchParams.get("cursor") ?? "first";
        return state.pages[key] ?? { orders: [], nextCursor: null };
      }
      if (state.detailStatus !== 200) {
        throw new actual.AdminApiError("Order not found.", state.detailStatus);
      }
      return { order: state.detail };
    },
    apiSend: async () => ({}),
  };
});

import { ORDERS_PAGE_SIZE, useOrder, useOrders } from "../use-orders";

const o = (id: string) => ({ id }) as unknown as Order;

beforeEach(() => {
  state.requests = [];
  state.pages = {
    first: { orders: [o("PS-3"), o("PS-2")], nextCursor: "c1" },
    c1: { orders: [o("PS-1")], nextCursor: null },
  };
  state.detail = null;
  state.detailStatus = 200;
});
afterEach(() => vi.useRealTimers());

describe("useOrders pagination", () => {
  it("loads the newest page with the page size and exposes hasMore", async () => {
    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.requests[0]).toBe(`/api/admin/orders?limit=${ORDERS_PAGE_SIZE}`);
    expect(result.current.orders.map((x) => x.id)).toEqual(["PS-3", "PS-2"]);
    expect(result.current.hasMore).toBe(true);
  });

  it("loadMore appends the older page through the server cursor", async () => {
    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(state.requests[1]).toContain("cursor=c1");
    expect(result.current.orders.map((x) => x.id)).toEqual(["PS-3", "PS-2", "PS-1"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("refresh re-walks every opened page so loaded orders stay fresh", async () => {
    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    state.requests = [];
    await act(async () => {
      await result.current.refresh();
    });
    expect(state.requests).toEqual([
      `/api/admin/orders?limit=${ORDERS_PAGE_SIZE}`,
      `/api/admin/orders?limit=${ORDERS_PAGE_SIZE}&cursor=c1`,
    ]);
    expect(result.current.orders).toHaveLength(3);
  });

  it("sends the search to the server", async () => {
    const { result } = renderHook(() => useOrders({ q: "0171" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.requests[0]).toBe(
      `/api/admin/orders?limit=${ORDERS_PAGE_SIZE}&q=0171`,
    );
  });
});

describe("useOrder (detail fallback)", () => {
  it("serves an order from the loaded list without a detail call", async () => {
    const { result } = renderHook(() => useOrder("PS-2"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.order?.id).toBe("PS-2");
    expect(state.requests.some((r) => r.includes("/api/admin/orders/"))).toBe(false);
  });

  it("fetches an order older than the loaded pages by order number", async () => {
    state.detail = { id: "PS-0001" };
    const { result } = renderHook(() => useOrder("PS-0001"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.order?.id).toBe("PS-0001");
    expect(state.requests).toContain("/api/admin/orders/PS-0001");
  });

  it("settles as not-found only after the detail endpoint says 404", async () => {
    state.detailStatus = 404;
    const { result } = renderHook(() => useOrder("PS-NOPE"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.order).toBeUndefined();
    expect(result.current.error).toBeNull();
  });
});
