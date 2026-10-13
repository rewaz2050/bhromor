/**
 * "Shoppers are waiting on your reply" on the vendor dashboard (2026-10-13).
 *
 * The Messages tab existed but nothing pointed at it, so a customer's
 * question was invisible until the shop opened the tab. The card's whole job
 * is to be loud when there is something to answer and absent when there is
 * not — a permanent empty card on a counter phone is just noise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import MessagesAwaitingCard from "../messages-awaiting-card";

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
  threads = [thread()];
  globalThis.fetch = vi.fn(async () => jsonResponse({ threads })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("MessagesAwaitingCard", () => {
  it("shouts when a shopper's question has no answer", async () => {
    render(<MessagesAwaitingCard />);
    await waitFor(() =>
      expect(screen.getByTestId("messages-awaiting-card")).toBeTruthy(),
    );
    expect(screen.getByText(/waiting on your reply/)).toBeTruthy();
    expect(screen.getByText(/Is the M in stock\?/)).toBeTruthy();
  });

  it("stays out of the way once the shop has the last word", async () => {
    threads = [thread({ lastSender: "shop", lastBody: "Yes, two left." })];
    render(<MessagesAwaitingCard />);
    // Give the read time to land before asserting absence.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("messages-awaiting-card")).toBeNull(),
    );
  });

  it("ignores a closed thread — nobody owes an answer there", async () => {
    threads = [thread({ status: "closed" })];
    render(<MessagesAwaitingCard />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("messages-awaiting-card")).toBeNull(),
    );
  });
});
