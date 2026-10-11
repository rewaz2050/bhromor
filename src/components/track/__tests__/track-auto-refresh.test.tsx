/**
 * The open tracker keeps itself honest (2026-10-11).
 *
 * The page read the order exactly once, so a customer who left /track open
 * watched "Confirmed — the shop is packing" for the whole delivery while the
 * rider had long since picked it up. The pin moved on its own poll; the
 * milestone did not. These pin the three things that matter: it re-reads, a
 * failed re-read is silent, and it stops once there is nothing left to change.
 *
 * Driven by hand rather than `waitFor`: under `vi.useFakeTimers()` the
 * testing-library poller still waits on the real clock, so the assertions
 * flush the microtask queue through the fake timer instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { act, createElement } from "react";
import TrackView from "@/components/track/track-view";
import { LanguageProvider } from "@/components/i18n/language-provider";
import type { Order, OrderStatus } from "@/lib/orders";

// The map pulls in Leaflet; this test is about the milestone, not the tiles.
vi.mock("@/components/track/live-delivery-map", () => ({ LiveDeliveryMap: () => null }));

const base: Order = {
  id: "PS-20261011-0001",
  createdAt: Date.UTC(2026, 9, 11, 6, 0),
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
  timeline: [{ status: "pending", at: Date.UTC(2026, 9, 11, 6, 0) }],
};

const trackCalls: string[] = [];
let served: OrderStatus = "confirmed";
let failNext = false;

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith("/api/track?")) {
    trackCalls.push(url);
    if (failNext) {
      failNext = false;
      return Promise.resolve(new Response(JSON.stringify({ error: "boom" }), { status: 503 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ order: { ...base, status: served } }), { status: 200 }),
    );
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
};

/** Move the fake clock and let every settled promise land inside act(). */
const tick = async (ms: number) => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(ms / 6);
  });
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/track?id=PS-20261011-0001&phone=01711111111");
  trackCalls.length = 0;
  served = "confirmed";
  failNext = false;
  vi.stubGlobal("fetch", mockFetch);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrackView — the open page re-reads the order", () => {
  it("picks up a status change the customer did not ask for", async () => {
    render(createElement(LanguageProvider, null, createElement(TrackView)));
    await tick(1);
    expect(trackCalls).toHaveLength(1);
    expect(screen.getByText(/Confirmed — the shop is packing/i)).toBeInTheDocument();

    served = "out-for-delivery";
    await tick(15_000);

    expect(trackCalls).toHaveLength(2);
    // Same order, same proof — a re-read, not a new lookup.
    expect(trackCalls[1]).toBe(trackCalls[0]);
    expect(screen.getByText(/On the way — keep your phone nearby/i)).toBeInTheDocument();
  });

  it("says nothing when one poll fails — the next tick tries again", async () => {
    render(createElement(LanguageProvider, null, createElement(TrackView)));
    await tick(1);
    expect(screen.getByText(/Confirmed — the shop is packing/i)).toBeInTheDocument();

    failNext = true;
    await tick(15_000);
    expect(trackCalls).toHaveLength(2);
    // Still on screen, no error panel — a dropped poll is not news.
    expect(screen.getByText(/Confirmed — the shop is packing/i)).toBeInTheDocument();

    served = "ready-for-pickup";
    await tick(15_000);
    expect(trackCalls).toHaveLength(3);
    expect(screen.queryByText(/Confirmed — the shop is packing/i)).toBeNull();
  });

  it("stops asking once the parcel has landed", async () => {
    served = "delivered";
    render(createElement(LanguageProvider, null, createElement(TrackView)));
    await tick(1);
    expect(trackCalls).toHaveLength(1);

    await tick(60_000);
    // Nothing left to change, so nothing is fetched.
    expect(trackCalls).toHaveLength(1);
  });
});
