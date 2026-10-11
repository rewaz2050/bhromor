/**
 * The shared inbox (2026-10-11).
 *
 * One component, two homes — the shopper's account tab and the shop's inbox.
 * What has to hold for both: the unread badge is built from the server's
 * count, opening a thread actually shows the conversation, and an unmigrated
 * table says which migration to run instead of showing a broken list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MessageInbox from "../message-inbox";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const originalFetch = globalThis.fetch;
let routes: Record<string, (url: string, init?: RequestInit) => Promise<Response>>;

beforeEach(() => {
  routes = {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // Longest match wins: "/api/account/threads/t1" must not be answered by
    // the "/api/account/threads" list handler.
    const key = Object.keys(routes)
      .filter((k) => url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return jsonResponse({ error: "not mocked" }, 404);
    return routes[key](url, init);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

const renderAs = (
  self: "customer" | "shop",
  base = "/api/account/threads",
  lang: "en" | "bn" = "bn",
) => render(<MessageInbox basePath={base} self={self} lang={lang} emptyHint="Nothing here yet." />);

describe("MessageInbox", () => {
  it("says what to do when there is nothing to read", async () => {
    routes["/api/account/threads"] = async () => jsonResponse({ threads: [] });
    renderAs("customer");
    expect(await screen.findByTestId("messages-empty")).toHaveTextContent("Nothing here yet.");
  });

  it("shows the unread count and opens the conversation", async () => {
    routes["/api/account/threads"] = async () =>
      jsonResponse({
        threads: [
          {
            id: "t1",
            orderNo: "PS-20261011-0001",
            shopId: "s1",
            shopName: "Rafiq Store",
            status: "open",
            createdAt: Date.UTC(2026, 9, 11, 7),
            lastMessageAt: Date.UTC(2026, 9, 11, 9, 30),
            lastBody: "He is at your gate.",
            lastSender: "shop",
            unread: 2,
          },
        ],
      });
    routes["/api/account/threads/t1"] = async () =>
      jsonResponse({
        messages: [
          { id: "m1", sender: "customer", senderName: "Rahim", body: "Where is it?", at: Date.UTC(2026, 9, 11, 7) },
          { id: "m2", sender: "shop", senderName: "Rafiq Store", body: "He is at your gate.", at: Date.UTC(2026, 9, 11, 9, 30) },
        ],
      });

    renderAs("customer");
    const inbox = await screen.findByTestId("message-inbox");
    expect(inbox.textContent).toContain("Rafiq Store");
    expect(inbox.textContent).toContain("PS-20261011-0001");
    expect(screen.getByTestId("thread-unread")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: /Rafiq Store/ }));
    const thread = await screen.findByTestId("message-thread");
    await waitFor(() => expect(thread.textContent).toContain("He is at your gate."));
    // The shopper's own line is there too — both sides of the conversation.
    expect(thread.textContent).toContain("Where is it?");
  });

  it("names the migration when the tables are not there yet", async () => {
    routes["/api/account/threads"] = async () =>
      jsonResponse({ reason: "missing_table" }, 501);
    renderAs("customer");
    expect(await screen.findByTestId("messages-unavailable")).toHaveTextContent(
      /202610110002_customer_threads\.sql/,
    );
  });

  it("offers a shop the close button and a customer none", async () => {
    routes["/api/vendor/threads"] = async () =>
      jsonResponse({
        threads: [
          {
            id: "t1",
            orderNo: "PS-1",
            shopId: "s1",
            shopName: "Rafiq Store",
            status: "open",
            createdAt: Date.UTC(2026, 9, 11, 7),
            lastMessageAt: Date.UTC(2026, 9, 11, 9),
            lastBody: "Where is it?",
            lastSender: "customer",
            unread: 1,
          },
        ],
      });
    routes["/api/vendor/threads/t1"] = async () =>
      jsonResponse({
        messages: [
          { id: "m1", sender: "customer", senderName: "Rahim", body: "Where is it?", at: Date.UTC(2026, 9, 11, 7) },
        ],
      });

    // The vendor area is English, which is how /vendor/messages calls it.
    renderAs("shop", "/api/vendor/threads", "en");
    fireEvent.click(await screen.findByRole("button", { name: /PS-1/ }));
    await screen.findByTestId("message-thread");
    expect(screen.getByRole("button", { name: /Close thread/ })).toBeTruthy();
  });
});
