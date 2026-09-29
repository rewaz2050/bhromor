/**
 * C2 (2026-09-28) — a bag from two shops, checked out in one tap.
 *
 * The promise is not "it works"; it is that the buyer is TOLD what the tap
 * does: two shops become two orders, each with its own delivery, and the
 * receipt names both. A buyer who finds out at the door has been cheated; a
 * buyer who reads it on the screen has simply decided.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import type { Shop } from "@/lib/catalog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fetchCalls: { url: string; body?: unknown }[] = [];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const shop = (id: string, name: string): Shop => ({
  id,
  slug: id,
  name,
  tagline: "",
  logoUrl: "",
  coverUrl: "",
  phone: "01711111111",
  address: "",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

const orderRow = (id: string, total: number) => ({
  id,
  createdAt: Date.now(),
  customer: { name: "Test Customer", phone: "01712345678", area: "Boropara" },
  zoneId: "z1",
  zoneName: "Zone A — City Centre",
  etaLabel: "40–50 min",
  items: [],
  subtotal: total - 3000,
  deliveryCharge: 3000,
  total,
  payment: "cod",
  status: "pending",
  timeline: [{ status: "pending", at: Date.now() }],
  deliveryCode: "1234",
});

const TWO_SHOPS = [
  shop("shop-a", "সিতারা"),
  shop("shop-b", "রঙধনু"),
];

const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push({ url, body: init?.body });
  if (url.includes("/api/orders")) {
    return Promise.resolve(
      jsonResponse(
        {
          orders: [orderRow("PS-A-1", 152000), orderRow("PS-B-1", 83000)],
          order: orderRow("PS-A-1", 152000),
        },
        201,
      ),
    );
  }
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({
        source: "live",
        products: PRODUCTS.map((p, i) => ({
          ...p,
          shopId: i === 0 ? "shop-a" : "shop-b",
        })),
        categories: CATEGORIES,
        shops: TWO_SHOPS,
      }),
    );
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  window.localStorage.clear();
  fetchCalls.length = 0;
  vi.stubGlobal("fetch", mockFetch);
  const bag = PRODUCTS.slice(0, 2).map((p) => ({
    productId: p.id,
    variantLabel: `${p.colors[0]} · ${p.sizes[0]}`,
    qty: 1,
  }));
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(bag));
});

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), {
    target: { value: "Test Customer" },
  });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), {
    target: { value: "01712345678" },
  });
  fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), {
    target: { value: "Boropara" },
  });
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road" },
  });
};

it("shows the two parcels before the tap, each with its own delivery", async () => {
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(CartProvider, null, createElement(CheckoutView)),
    ),
  );

  // The card is rendered twice on purpose (inside step ③ for phones, in the
  // desktop rail) — exactly like the summary card it sits beside.
  await waitFor(() => expect(screen.getAllByTestId("shop-split").length).toBeGreaterThan(0));
  const card = screen.getAllByTestId("shop-split")[0];
  expect(card).toHaveTextContent("২টি দোকান · ২টি অর্ডার");
  expect(card).toHaveTextContent("সিতারা");
  expect(card).toHaveTextContent("রঙধনু");
  // Two parcels, two deliveries — the whole point of showing this at all.
  expect(screen.getAllByTestId("parcel-total-shop-a").length).toBeGreaterThan(0);
  expect(screen.getAllByTestId("parcel-total-shop-b").length).toBeGreaterThan(0);
  expect(card.textContent?.match(/ডেলিভারি/g)?.length).toBeGreaterThanOrEqual(2);
});

it("places ONE request and names both orders on the receipt", async () => {
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(CartProvider, null, createElement(CheckoutView)),
    ),
  );

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
  );
  fill();
  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));

  await waitFor(
    () => expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0),
    { timeout: 5000 },
  );

  // One tap, one request: the server does the splitting.
  const orderCalls = fetchCalls.filter((c) => c.url.includes("/api/orders"));
  expect(orderCalls).toHaveLength(1);

  // Both order numbers are on the receipt, with the shop each comes from.
  const receipt = screen.getAllByTestId("receipt-orders")[0];
  expect(receipt).toHaveTextContent("PS-A-1");
  expect(receipt).toHaveTextContent("PS-B-1");
  expect(receipt).toHaveTextContent("সিতারা");
  expect(receipt).toHaveTextContent("রঙধনু");
  expect(receipt).toHaveTextContent("২টি ডেলিভারি আসবে");
});
