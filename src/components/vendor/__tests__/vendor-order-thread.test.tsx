/**
 * The shopper's question on the vendor order page (2026-10-13).
 *
 * The inbox lived on its own tab, so a question about the order the shop was
 * packing was invisible unless someone went looking elsewhere. What matters
 * here is the two ends: the panel appears when there is a conversation to
 * answer, and it stays out of the way when there is not — an "no messages"
 * card on every order is noise the shop learns to skip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import VendorOrderThread from "../vendor-order-thread";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const originalFetch = globalThis.fetch;
let askedFor: string[];

beforeEach(() => {
  askedFor = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("VendorOrderThread", () => {
  it("shows the conversation for the order it is standing on", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      askedFor.push(String(input));
      if (String(input).includes("/api/vendor/threads/t1")) {
        return jsonResponse({ messages: [] });
      }
      return jsonResponse({
        threads: [{ id: "t1", orderNo: "PS-20261013-0004" }],
      });
    }) as unknown as typeof fetch;

    render(<VendorOrderThread orderNo="PS-20261013-0004" />);
    await waitFor(() => expect(screen.getByTestId("vendor-order-thread")).toBeTruthy());
    // The thread reads its own messages, so it is still loading a beat later.
    await waitFor(() => expect(screen.getByTestId("message-thread")).toBeTruthy());
    // The lookup is scoped to this order, not the whole inbox.
    expect(askedFor[0]).toContain("orderNo=PS-20261013-0004");
  });

  it("renders nothing when nobody has written about this order", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ threads: [] })) as unknown as typeof fetch;
    render(<VendorOrderThread orderNo="PS-20261013-0004" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("vendor-order-thread")).toBeNull());
  });

  it("leaves the order page alone when the threads table is not migrated", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("orderNo=")) {
        return jsonResponse({ threads: [], reason: "missing_table" }, 501);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;
    render(<VendorOrderThread orderNo="PS-20261013-0004" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("vendor-order-thread")).toBeNull());
  });
});
