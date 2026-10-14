/**
 * "Message the shop" on the tracker (2026-10-11).
 *
 * A thread belongs to an account, so the two things that matter are: a guest
 * is sent to sign in with the tracker as the way back rather than being shown
 * a composer that cannot work, and a signed-in shopper's message goes up with
 * the order number — the shop is resolved from that order server-side, never
 * from anything the browser sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { makePlacedOrder, type Order } from "@/lib/orders";
import MessageShop from "../message-shop";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const order: Order = {
  ...makePlacedOrder({
    id: "PS-20261011-0001",
    createdAt: Date.UTC(2026, 9, 11, 6),
    customer: { name: "Rahim", phone: "01712345678", area: "Boropara" },
    zone: { id: "z1", name: "Zone A", etaLabel: "45–50 min", charge: 6000 },
    items: [
      {
        product: { id: "p1", slug: "panjabi", sku: "SKU-1", name: "Panjabi", price: 250000 },
        image: "/img.jpg",
        variant: "M",
        qty: 1,
      },
    ],
  }),
  status: "out-for-delivery",
};

const originalFetch = globalThis.fetch;
let posts: Record<string, unknown>[] = [];
let signedIn: { customer: { id: string; name: string; phone: string } | null };

beforeEach(() => {
  // The sign-in link carries the tracker as the way back, so be on it.
  window.history.replaceState({}, "", "/track?id=PS-20261011-0001&phone=01712345678");
  posts = [];
  signedIn = { customer: null };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/account/me")) return jsonResponse(signedIn);
    if (url.includes("/api/contact")) return jsonResponse({});
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse({ opened: true, threadId: "t1" });
    }
    if (url.includes("/api/account/threads/t1")) return jsonResponse({ messages: [] });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

const mount = () =>
  render(
    <LanguageProvider initialLang="en">
      <MessageShop order={order} />
    </LanguageProvider>,
  );

describe("MessageShop", () => {
  it("sends a guest to sign in, with the tracker as the way back", async () => {
    mount();
    const link = await screen.findByRole("link", { name: /Sign in to message the shop/ });
    const href = decodeURIComponent(link.getAttribute("href") ?? "");
    expect(href.startsWith("/account?next=")).toBe(true);
    expect(href).toContain("/track");
    // No composer that cannot work.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends a signed-in shopper's message with the order number", async () => {
    signedIn = { customer: { id: "c1", name: "Rahim", phone: "01712345678" } };
    mount();
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "Is the blue one still available?" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      orderNo: "PS-20261011-0001",
      body: "Is the blue one still available?",
    });
    // The thread takes over the composer, so the reply is readable in place.
    expect(await screen.findByTestId("message-thread")).toBeTruthy();
  });

  it("shows the conversation that already exists instead of a blank composer", async () => {
    signedIn = { customer: { id: "c1", name: "Rahim", phone: "01712345678" } };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/account/me")) return jsonResponse(signedIn);
      if (url.includes("/api/account/threads/t1")) return jsonResponse({ messages: [] });
      if (init?.method === "POST") return jsonResponse({ threadId: "t1" });
      if (url.includes("/api/account/threads")) {
        return jsonResponse({ threads: [{ id: "t1", orderNo: "PS-20261011-0001" }] });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    mount();
    // The shopper wrote before and left; the shop may have answered since.
    // The conversation takes the place of the "start a conversation" box —
    // the thread has its own reply field, so the thing that must be gone is
    // the placeholder that invites a first message.
    await waitFor(() => expect(screen.getByTestId("message-thread")).toBeTruthy());
    expect(screen.queryByPlaceholderText(/What would you like to ask/)).toBeNull();
  });

  it("says WhatsApp for now when the tables are not migrated", async () => {
    signedIn = { customer: { id: "c1", name: "Rahim", phone: "01712345678" } };
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ reason: "missing_table" }, 501);
      if (String(_input).includes("/api/account/me")) return jsonResponse(signedIn);
      return jsonResponse({});
    }) as unknown as typeof fetch;

    mount();
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Hello?" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/WhatsApp/);
  });
});
