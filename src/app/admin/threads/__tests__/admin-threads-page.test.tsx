/**
 * The staff oversight inbox for shopper ↔ shop threads (2026-10-13).
 *
 * The two routes behind it had existed since the messaging pass with nothing
 * calling them, so a shop that stopped answering left its customer with no way
 * to reach the platform. What matters: the list calls out the conversations
 * that still owe an answer, an unmigrated table is named rather than shown as
 * a broken page, and picking a thread opens it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminThreadsPage from "../page";

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
let response: { body: unknown; status: number };

beforeEach(() => {
  response = { body: { threads: [thread()] }, status: 200 };
  globalThis.fetch = vi.fn(async () => jsonResponse(response.body, response.status)) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("/admin/threads", () => {
  it("lists the conversations and counts the ones awaiting a reply", async () => {
    render(<AdminThreadsPage />);
    await waitFor(() => expect(screen.getByTestId("threads-list")).toBeTruthy());
    expect(screen.getByTestId("threads-awaiting")).toHaveTextContent(
      "1 awaiting a reply",
    );
    expect(screen.getByText(/needs reply/)).toBeTruthy();
  });

  it("names the migration instead of showing a broken page", async () => {
    response = { body: { threads: [], reason: "missing_table" }, status: 501 };
    render(<AdminThreadsPage />);
    await waitFor(() =>
      expect(screen.getByTestId("threads-error")).toHaveTextContent(
        /202610110002_customer_threads\.sql/,
      ),
    );
  });

  it("opens the conversation that was picked", async () => {
    response = { body: { threads: [thread()] }, status: 200 };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/threads/t1")) return jsonResponse({ messages: [] });
      return jsonResponse(response.body, response.status);
    }) as unknown as typeof fetch;

    render(<AdminThreadsPage />);
    await waitFor(() => expect(screen.getByTestId("threads-list")).toBeTruthy());
    fireEvent.click(screen.getByText(/PS-20261013-0004/));
    // The thread reads its own messages, so it lands a beat after the click.
    await waitFor(() => expect(screen.getByTestId("message-thread")).toBeTruthy());
  });

  it("says plainly when there is nothing to read", async () => {
    response = { body: { threads: [] }, status: 200 };
    render(<AdminThreadsPage />);
    await waitFor(() => expect(screen.getByTestId("threads-empty")).toBeTruthy());
  });
});
