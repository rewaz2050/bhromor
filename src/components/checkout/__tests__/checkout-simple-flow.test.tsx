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
import { getNotifs } from "@/lib/notifications-store";
import { NOTIFS_STORAGE_KEY } from "@/lib/notification-store";

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

  // → The admin inbox must receive a notification for the new order.
  const notifs = getNotifs();
  const orderNotif = notifs.find(
    (n) => n.kind === "order" && n.title.includes("নতুন অর্ডার"),
  );
  expect(orderNotif).toBeTruthy();
  expect(orderNotif!.read).toBe(false);
  expect(orderNotif!.body).toContain("Test Customer");
  expect(orderNotif!.href).toContain("/admin/orders/");
});

it("does not double-notify when the server already stored the order", async () => {
  // live-style response → server owns the notification; no local push
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/orders")) {
      return Promise.resolve(
        jsonResponse({
          order: {
            id: "PS-LIVE-1",
            createdAt: Date.now(),
            customer: { name: "Live Customer", phone: "01712345678", area: "Boropara" },
            zoneId: "z1",
            zoneName: "Zone A",
            etaLabel: "30–40 min",
            items: [],
            subtotal: 149000,
            deliveryCharge: 3000,
            total: 152000,
            payment: "cod",
            status: "pending",
            timeline: [],
          },
        }),
      );
    }
    if (url.includes("/api/promo")) {
      return Promise.resolve(jsonResponse({ totalOrders: 3, remainingFree: 7, promoActive: true, limit: 10 }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  window.localStorage.removeItem(NOTIFS_STORAGE_KEY);
  const before = getNotifs().length;

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
  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), { target: { value: "Live Customer" } });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), { target: { value: "01712345678" } });
  fireEvent.click(screen.getByRole("button", { name: "Boropara" }));
  fireEvent.change(screen.getByPlaceholderText(/House 12/), { target: { value: "House 1, College Road" } });
  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
  await waitFor(() => {
    expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0);
  }, { timeout: 5000 });

  // no NEW local notification (server already did it)
  expect(getNotifs().length).toBe(before);
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
