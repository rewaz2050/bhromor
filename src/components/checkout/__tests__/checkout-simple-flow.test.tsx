/**
 * Regression: the SIMPLE checkout flow places an order end-to-end (demo mode).
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
import { PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";

afterEach(cleanup);

const fetchCalls: { url: string; body?: unknown }[] = [];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  fetchCalls.push({ url });
  if (url.includes("/api/orders")) {
    return Promise.resolve(jsonResponse({ demoMode: true }));
  }
  if (url.includes("/api/promo")) {
    return Promise.resolve(
      jsonResponse({
        totalOrders: 3,
        remainingFree: 7,
        promoActive: true,
        limit: 10,
      }),
    );
  }
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", mockFetch);
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([
      { productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 },
    ]),
  );
});

it("places an order through the simple form (demo mode)", async () => {
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
  // District + Upazila default to Sunamganj / Sunamganj Sadar — pick a para.
  const paraSelect = screen.getAllByRole("combobox").find(
    (el) => (el as HTMLSelectElement).querySelector('option[value="Boropara"]'),
  ) as HTMLSelectElement;
  expect(paraSelect).toBeTruthy();
  fireEvent.change(paraSelect, { target: { value: "Boropara" } });
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
  const paraSelect = screen.getAllByRole("combobox").find(
    (el) => (el as HTMLSelectElement).querySelector('option[value="Boropara"]'),
  ) as HTMLSelectElement;
  // Choose "Other" → free-text input appears.
  fireEvent.change(paraSelect, { target: { value: "__other__" } });
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
