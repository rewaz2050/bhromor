/**
 * The home page's live-order card (2026-10-13).
 *
 * The home page used to know nothing about the shopper: its whole tree read
 * the catalog and the CMS settings, so a customer with a parcel on the way
 * got the shop shelf and had to find /track at the bottom. What matters here
 * is that the card appears for the person who has an order and stays out of
 * the way of everyone else — and that a guest is never even asked about one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { __resetCustomerProbe, __resetLiveAuthForTests } from "@/lib/customer-session";
import HomeOrders from "../home-orders";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const row = (over: Record<string, unknown> = {}) => ({
  id: "PS-20261011-0001",
  createdAt: Date.UTC(2026, 9, 11, 6),
  status: "out-for-delivery",
  total: 250000,
  itemCount: 2,
  firstItem: "Cotton Panjabi · M",
  payment: "cod",
  paymentStatus: "verified",
  scheduledAt: null,
  deliveryWindow: null,
  isPickup: false,
  isReturn: false,
  shopId: "s1",
  shopName: "Prosanti",
  lines: [{ productId: "p1", variantLabel: "M", qty: 2, name: "Cotton Panjabi" }],
  ...over,
});

const originalFetch = globalThis.fetch;
let signedIn: { customer: { id: string; name: string; phone: string } | null };
let orders: unknown[];
let meCalls: number;
let orderCalls: number;

beforeEach(() => {
  // The session store and its probe memo are module singletons, so the guest
  // test would otherwise leave "signed out" cached for every test after it.
  __resetLiveAuthForTests();
  __resetCustomerProbe();
  signedIn = { customer: { id: "c1", name: "Rahim", phone: "01712345678" } };
  orders = [row()];
  meCalls = 0;
  orderCalls = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/account/me")) {
      meCalls += 1;
      return jsonResponse(signedIn);
    }
    if (url.includes("/api/account/orders")) {
      orderCalls += 1;
      return jsonResponse({ orders, phone: signedIn.customer?.phone ?? "" });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

const renderHome = () =>
  render(
    <LanguageProvider>
      <HomeOrders />
    </LanguageProvider>,
  );

describe("HomeOrders", () => {
  it("says nothing — and asks for nothing — for a visitor who is not signed in", async () => {
    signedIn = { customer: null };
    renderHome();
    // Let the session probe actually resolve before asserting absence.
    await waitFor(() => expect(meCalls).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByTestId("home-orders")).toBeNull());
    expect(orderCalls).toBe(0);
  });

  it("puts a moving parcel at the top with a prefilled track link", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByTestId("home-orders")).toBeTruthy());
    const link = screen.getByTestId("home-order-track");
    expect(link.getAttribute("href")).toBe(
      "/track?id=PS-20261011-0001&phone=01712345678",
    );
    // The shop is what makes the row recognisable, and the step is the answer
    // to "where is it" — both before the shopper has to open the tracker.
    expect(screen.getByText("Prosanti")).toBeTruthy();
    expect(screen.getByText(/Picked up/)).toBeTruthy();
  });

  it("offers the last order again once nothing is moving", async () => {
    orders = [row({ status: "delivered" })];
    renderHome();
    await waitFor(() => expect(screen.getByTestId("home-order-again")).toBeTruthy());
    expect(screen.queryByTestId("home-order-track")).toBeNull();
  });

  it("renders nothing for a shopper with no orders at all", async () => {
    orders = [];
    renderHome();
    await waitFor(() => expect(orderCalls).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByTestId("home-orders")).toBeNull());
  });
});
