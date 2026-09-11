/**
 * Regression: the SIMPLE checkout flow places an order end-to-end (live).
 * District → upazila → para (select) → address → place order.
 * Guards against "order place kora jacce na" — any break in the chain fails
 * this test loudly.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fetchCalls: { url: string; body?: unknown }[] = [];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const placedOrder = (id: string, name: string) => ({
  order: {
    id,
    createdAt: Date.now(),
    customer: { name, phone: "01712345678", area: "Boropara" },
    zoneId: "z1",
    zoneName: "Zone A — City Centre",
    etaLabel: "40–50 min",
    items: [],
    subtotal: 149000,
    deliveryCharge: 3000,
    total: 152000,
    payment: "cod",
    status: "pending",
    timeline: [{ status: "pending", at: Date.now() }],
    deliveryCode: "1234",
  },
});

const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push({ url, body: init?.body });
  if (url.includes("/api/orders")) {
    return Promise.resolve(jsonResponse(placedOrder("PS-LIVE-1", "Test Customer")));
  }
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({
        source: "live",
        products: PRODUCTS,
        categories: CATEGORIES,
        shops: [],
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
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([
      { productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 },
    ]),
  );
});

it("places an order through the simple form (live)", async () => {
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(CartProvider, null, createElement(CheckoutView)),
    ),
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument();
  });

  // The promo/coupon section must live INSIDE the order form, before the
  // Place Order button — not tucked at the bottom of the summary sidebar.
  const formEl = screen.getByRole("button", { name: /Place Order/i }).closest("form")!;
  expect(formEl).toBeTruthy();
  expect(Array.from(formEl.querySelectorAll("input,button")).some((el) =>
    (el as HTMLInputElement).placeholder === "e.g. WELCOME100",
  )).toBe(true);

  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), {
    target: { value: "Test Customer" },
  });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), {
    target: { value: "01712345678" },
  });
  // District + Upazila default to Sunamganj / Sunamganj Sadar — paras are
  // direct chips: tap "Boropara".
  fireEvent.click(screen.getByRole("button", { name: "Boropara" }));
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road, Mosque-এর পাশে" },
  });

  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));

  await waitFor(
    () => {
      expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0);
    },
    { timeout: 5000 },
  );

  const orderCall = fetchCalls.find((c) => c.url.includes("/api/orders"));
  expect(orderCall).toBeTruthy();
});

it("stays placeable when the para is typed by hand (other para)", async () => {
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(CartProvider, null, createElement(CheckoutView)),
    ),
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument();
  });

  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), {
    target: { value: "Test Customer" },
  });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), {
    target: { value: "01812345678" },
  });
  // "Other para" chip → free-text input appears.
  fireEvent.click(screen.getByRole("button", { name: /অন্য পাড়া/ }));
  const typed = screen.getByPlaceholderText(/পাড়া \/ গ্রামের নাম লিখুন/);
  fireEvent.change(typed, { target: { value: "Notun para" } });
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 5, Temple Road" },
  });

  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));

  await waitFor(
    () => {
      expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0);
    },
    { timeout: 5000 },
  );
});
