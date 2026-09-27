/**
 * UX plan §6 (R11l): when the order request dies on the network, the customer
 * gets ONE tap to send the same order again — no re-typing, no "fix fields".
 * A validation error from the server keeps the fix-fields path instead.
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const placedOrder = (id: string) => ({
  order: {
    id,
    createdAt: Date.now(),
    customer: { name: "Test Customer", phone: "01712345678", area: "Boropara" },
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

let orderAttempts = 0;
/** What each successive POST /api/orders does. */
let orderScript: Array<"network" | "server" | "invalid" | "ok"> = [];

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/orders")) {
    const step = orderScript[orderAttempts] ?? "ok";
    orderAttempts += 1;
    if (step === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (step === "server") return Promise.resolve(jsonResponse({ error: "Database unavailable" }, 503));
    if (step === "invalid") {
      return Promise.resolve(
        jsonResponse({ error: "Phone number is invalid", field: "phone" }, 400),
      );
    }
    return Promise.resolve(jsonResponse(placedOrder(`PS-RETRY-${orderAttempts}`)));
  }
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }),
    );
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
  orderAttempts = 0;
  orderScript = [];
  vi.stubGlobal("fetch", mockFetch);
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 }]),
  );
});

async function fillAndPlace() {
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
    target: { value: "01712345678" },
  });
  fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), {
    target: { value: "Boropara" },
  });
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
}

it("network failure → one-tap retry re-sends the same order", async () => {
  orderScript = ["network", "ok"];
  await fillAndPlace();

  const retry = await screen.findByTestId("order-retry", {}, { timeout: 5000 });
  expect(retry).toHaveTextContent(/Try again/i);
  expect(screen.queryByTestId("order-fix-fields")).toBeNull();
  expect(orderAttempts).toBe(1);

  fireEvent.click(retry);

  await waitFor(
    () => {
      expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0);
    },
    { timeout: 5000 },
  );
  expect(orderAttempts).toBe(2);
});

it("a 5xx with nothing to fix is also retryable", async () => {
  orderScript = ["server", "ok"];
  await fillAndPlace();

  const retry = await screen.findByTestId("order-retry", {}, { timeout: 5000 });
  fireEvent.click(retry);

  await waitFor(
    () => {
      expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0);
    },
    { timeout: 5000 },
  );
  expect(orderAttempts).toBe(2);
});

it("a field error keeps the fix-fields path — no blind retry", async () => {
  orderScript = ["invalid", "ok"];
  await fillAndPlace();

  await screen.findByTestId("order-fix-fields", {}, { timeout: 5000 });
  expect(screen.queryByTestId("order-retry")).toBeNull();
  expect(orderAttempts).toBe(1);
});
