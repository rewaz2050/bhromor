/**
 * P0 #5 / #4 — /track opened from the receipt link prefills BOTH fields and
 * looks the order up by itself; the last order placed on this device is one
 * tap away; the slot the customer chose is printed on the result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import TrackView from "@/components/track/track-view";
import { LanguageProvider } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";
import { LAST_ORDER_KEY } from "@/lib/last-order";

/** The receipt link lands here: /track?id=…&phone=… */
const visit = (query: string) => window.history.replaceState({}, "", `/track${query}`);

const order: Order = {
  id: "PS-20260918-0007",
  createdAt: 1_758_180_000_000,
  customer: { name: "Rahim", phone: "01711111111", area: "Boropara", address: "House 12" },
  items: [
    {
      productId: "p1",
      slug: "p1",
      name: "Cotton Panjabi",
      sku: "PAN-COT-WHT-M",
      variant: "M / White",
      qty: 1,
      unitPrice: 150000,
      image: "/images/products/panjabi.webp",
    },
  ],
  zoneId: "z1",
  zoneName: "Zone A",
  etaLabel: "45-50 min",
  deliveryCharge: 6000,
  total: 156000,
  subtotal: 150000,
  payment: "cod",
  status: "confirmed",
  timeline: [{ status: "pending", at: 1_758_180_000_000 }],
  deliveryWindow: "evening",
  scheduledAt: Date.UTC(2026, 8, 18, 12), // 18:00 Dhaka
};

const fetchCalls: string[] = [];
const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  fetchCalls.push(url);
  if (url.startsWith("/api/track?")) {
    const u = new URL(url, "http://localhost");
    const ok = u.searchParams.get("id") === order.id && u.searchParams.get("phone") === "01711111111";
    return Promise.resolve(
      ok
        ? new Response(JSON.stringify({ order }), { status: 200 })
        : new Response(JSON.stringify({ error: "Order not found" }), { status: 404 }),
    );
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
};

const mount = () => render(createElement(LanguageProvider, null, createElement(TrackView)));

beforeEach(() => {
  window.localStorage.clear();
  fetchCalls.length = 0;
  visit("");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrackView — receipt prefill", () => {
  it("prefills id + phone from the URL and looks the order up without a tap", async () => {
    visit("?id=ps-20260918-0007&phone=01711111111");
    mount();
    await waitFor(() => expect(fetchCalls.some((u) => u.startsWith("/api/track?"))).toBe(true));
    expect((screen.getByPlaceholderText("PS-YYYYMMDD-XXXX") as HTMLInputElement).value).toBe(
      "PS-20260918-0007",
    );
    expect((screen.getByPlaceholderText("017XXXXXXXX") as HTMLInputElement).value).toBe("01711111111");
    await waitFor(() => expect(screen.getByTestId("track-slot")).toBeInTheDocument());
    // The slot line matches what admin/rider print (P0 #4).
    expect(screen.getByTestId("track-slot").textContent).toMatch(/Evening \(6–9 PM\) · 18 Sep/);
    // Looked up exactly once — no double fetch on re-render.
    expect(fetchCalls.filter((u) => u.startsWith("/api/track?")).length).toBe(1);
  });

  it("with only ?id= it prefills the id and waits for the phone (no request)", async () => {
    visit("?id=PS-20260918-0007");
    mount();
    await waitFor(() =>
      expect((screen.getByPlaceholderText("PS-YYYYMMDD-XXXX") as HTMLInputElement).value).toBe(
        "PS-20260918-0007",
      ),
    );
    expect(fetchCalls.some((u) => u.startsWith("/api/track?"))).toBe(false);
  });
});

describe("TrackView — last-order shortcut", () => {
  it("offers the order the receipt remembered and tracks it in one tap", async () => {
    window.localStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify({ id: order.id, phone: "01711111111", placedAt: Date.now(), total: 156000 }),
    );
    mount();
    const shortcut = await screen.findByTestId("last-order-shortcut");
    expect(shortcut.textContent).toContain("PS-20260918-0007");
    fireEvent.click(screen.getByRole("button", { name: "ট্র্যাক করুন" }));
    await waitFor(() => expect(screen.getByTestId("track-slot")).toBeInTheDocument());
    // Once the order is on screen the shortcut steps aside.
    expect(screen.queryByTestId("last-order-shortcut")).not.toBeInTheDocument();
  });

  it("can be dismissed", async () => {
    window.localStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify({ id: order.id, phone: "01711111111", placedAt: Date.now() }),
    );
    mount();
    await screen.findByTestId("last-order-shortcut");
    fireEvent.click(screen.getByRole("button", { name: "শেষ অর্ডার শর্টকাট সরান" }));
    expect(screen.queryByTestId("last-order-shortcut")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(LAST_ORDER_KEY)).toBeNull();
  });

  it("does not show a shortcut on a fresh device", () => {
    mount();
    expect(screen.queryByTestId("last-order-shortcut")).not.toBeInTheDocument();
  });
});
