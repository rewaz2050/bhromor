/**
 * P1 #14 — the track page can finally do what the receipt promised: cancel
 * an order that has not been packed yet. Two taps, the timeline flips to
 * cancelled on success, and a packed order gets "call us" instead of a
 * button that does nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import TrackView from "@/components/track/track-view";
import { LanguageProvider } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";

const visit = (query: string) => window.history.replaceState({}, "", `/track${query}`);

const baseOrder: Order = {
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
};

let order: Order = baseOrder;
let cancelStatus = 200;
const cancelCalls: { body: unknown }[] = [];

const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/track?")) {
    return Promise.resolve(new Response(JSON.stringify({ order }), { status: 200 }));
  }
  if (url === "/api/track/cancel") {
    cancelCalls.push({ body: JSON.parse(String(init?.body)) });
    const body =
      cancelStatus === 200
        ? { ok: true, status: "cancelled", paymentRejected: false }
        : { error: "too late to cancel online", code: "too_late" };
    return Promise.resolve(new Response(JSON.stringify(body), { status: cancelStatus }));
  }
  if (url.startsWith("/api/contact")) {
    return Promise.resolve(new Response(JSON.stringify({ whatsapp: "01700000000" }), { status: 200 }));
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
};

const mount = () => render(createElement(LanguageProvider, null, createElement(TrackView)));

beforeEach(() => {
  window.localStorage.clear();
  order = baseOrder;
  cancelStatus = 200;
  cancelCalls.length = 0;
  visit("?id=PS-20260918-0007&phone=01711111111");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrackView — customer cancel", () => {
  it("cancels a confirmed order in two taps and flips the timeline", async () => {
    mount();
    const panel = await screen.findByTestId("cancel-panel");
    expect(panel).toBeInTheDocument();
    // First tap opens the confirm row — nothing is sent yet.
    fireEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    expect(cancelCalls).toHaveLength(0);
    expect(screen.getByTestId("cancel-confirm")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "wrong size" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() => expect(cancelCalls).toHaveLength(1));
    expect(cancelCalls[0].body).toEqual({
      orderId: "PS-20260918-0007",
      phone: "01711111111",
      reason: "wrong size",
    });
    await waitFor(() =>
      expect(screen.getByTestId("cancel-message").textContent).toMatch(/Order cancelled/),
    );
    // The timeline now reads as cancelled — no refetch needed.
    expect(screen.getByText(/This order was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel this order" })).not.toBeInTheDocument();
  });

  it("'Keep the order' closes the confirm row without a request", async () => {
    mount();
    await screen.findByTestId("cancel-panel");
    fireEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep the order" }));
    expect(screen.queryByTestId("cancel-confirm")).not.toBeInTheDocument();
    expect(cancelCalls).toHaveLength(0);
  });

  it("offers 'call us' instead of a button once the parcel is with a rider", async () => {
    order = { ...baseOrder, status: "out-for-delivery" };
    mount();
    const panel = await screen.findByTestId("cancel-panel");
    expect(screen.queryByRole("button", { name: "Cancel this order" })).not.toBeInTheDocument();
    expect(panel.textContent).toMatch(/already packed/);
    await waitFor(() => expect(screen.getByRole("link", { name: /WhatsApp 01700000000/ })).toBeInTheDocument());
  });

  it("explains a 409 (staff moved it on) honestly", async () => {
    cancelStatus = 409;
    mount();
    await screen.findByTestId("cancel-panel");
    fireEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() =>
      expect(screen.getByTestId("cancel-message").textContent).toMatch(/already packed/),
    );
    // Still confirmed on screen — we did not pretend.
    expect(screen.queryByText(/This order was cancelled/)).not.toBeInTheDocument();
  });

  it("renders no panel for a delivered or cancelled order", async () => {
    order = { ...baseOrder, status: "delivered" };
    mount();
    await screen.findByText(/Cotton Panjabi/);
    expect(screen.queryByTestId("cancel-panel")).not.toBeInTheDocument();
  });
});
