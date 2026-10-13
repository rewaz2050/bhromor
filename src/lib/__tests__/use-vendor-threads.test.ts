/**
 * The count behind the Messages badge (2026-10-13).
 *
 * The vendor nav and the dashboard card both read this one number, and it is
 * deliberately "awaiting your reply" rather than "unread": there is no
 * shop-side read marker, and a rule built on an open thread whose last word
 * came from the customer clears itself the moment the shop answers. What must
 * not happen is a badge that never goes away, or one that counts a
 * conversation the shop already closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useVendorThreads } from "../use-vendor";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const thread = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  orderNo: "PS-20261013-0004",
  shopId: "s1",
  shopName: "Prosanti",
  status: "open",
  createdAt: Date.UTC(2026, 9, 13, 6),
  lastMessageAt: Date.UTC(2026, 9, 13, 7),
  lastBody: "Is the M in stock?",
  lastSender: "customer",
  unread: 0,
  ...over,
});

const originalFetch = globalThis.fetch;
let threads: unknown[];

beforeEach(() => {
  threads = [];
  globalThis.fetch = vi.fn(async () => jsonResponse({ threads })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useVendorThreads", () => {
  it("counts only open threads whose last word came from the customer", async () => {
    threads = [
      thread({ id: "a" }),
      thread({ id: "b" }),
      thread({ id: "c", lastSender: "shop", lastBody: "Yes, two left." }),
      thread({ id: "d", status: "closed" }),
    ];
    const { result } = renderHook(() => useVendorThreads(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.threads).toHaveLength(4);
    expect(result.current.awaiting).toBe(2);
  });

  it("is zero for an empty inbox, so the badge does not render", async () => {
    const { result } = renderHook(() => useVendorThreads(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.awaiting).toBe(0);
  });

  it("never fetches for a vendor who is not signed in", () => {
    const { result } = renderHook(() => useVendorThreads(false));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.awaiting).toBe(0);
  });
});
