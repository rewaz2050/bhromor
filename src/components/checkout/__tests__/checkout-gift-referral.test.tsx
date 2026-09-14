import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { REFERRAL_STORAGE_KEY } from "@/lib/referral";

/**
 * Gift mode + referral code have to leave the form as real payload keys — a
 * checkbox that never reaches /api/orders is a lie with nice styling. This
 * drives the actual checkout form and reads what was POSTed.
 */

const calls: { url: string; body?: unknown }[] = [];

const ok = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

const orderResponse = {
  order: {
    id: "PS-GIFT-1",
    createdAt: Date.now(),
    customer: { name: "Test Customer", phone: "01712345678", area: "Boropara" },
    zoneId: "z1",
    zoneName: "Zone A — City Centre",
    etaLabel: "40–50 min",
    items: [],
    subtotal: 129000,
    deliveryCharge: 6000,
    total: 135000,
    payment: "cod",
    status: "pending",
    timeline: [{ status: "pending", at: Date.now() }],
    deliveryCode: "4321",
  },
};

const product = PRODUCTS.find((p) => p.inStock)!;

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  // stock the registry synchronously — no demo fallback exists anymore
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: product.id, variantLabel: `${product.colors[0]} Free`, qty: 1 }]),
  );
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/api/orders")) return ok(orderResponse);
    if (url.includes("/api/products")) {
      return ok({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] });
    }
    if (url.includes("/api/zones")) return ok({ source: "live", zones: DELIVERY_ZONES });
    if (url.includes("/api/promo")) return ok({ source: "none", promos: null });
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetLiveCatalog();
});

const fillAndSubmit = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument();
  });
  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), { target: { value: "Test Customer" } });
  fireEvent.change(screen.getAllByPlaceholderText("017XXXXXXXX")[0], {
    target: { value: "01712345678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Boropara" }));
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
  await waitFor(() => {
    expect(calls.some((c) => c.url.includes("/api/orders"))).toBe(true);
  });
  return calls.find((c) => c.url.includes("/api/orders"))?.body as Record<string, unknown>;
};

const openGift = () => {
  fireEvent.click(screen.getByTestId("gift-step").querySelector("button")!);
};

describe("Checkout — gift mode", () => {
  it("sends the gift block when the step is on", async () => {
    render(
      createElement(
        LanguageProvider,
        null,
        createElement(CartProvider, null, createElement(CheckoutView)),
      ),
    );
    openGift();
    fireEvent.change(screen.getByLabelText(/Who is it for\?/), {
      target: { value: "Karim Bhai" },
    });
    fireEvent.change(screen.getByLabelText(/Card message/), {
      target: { value: "Eid Mubarak bhai" },
    });
    const body = await fillAndSubmit();
    expect(body.gift).toMatchObject({
      is_gift: true,
      gift_recipient_name: "Karim Bhai",
      gift_message: "Eid Mubarak bhai",
    });
    expect(typeof body.gift).toBe("object");
  });

  it("keeps gift off — and sends none of it — when the step is untouched", async () => {
    render(
      createElement(
        LanguageProvider,
        null,
        createElement(CartProvider, null, createElement(CheckoutView)),
      ),
    );
    const body = await fillAndSubmit();
    expect((body.gift as { is_gift?: boolean }).is_gift).toBeFalsy();
  });
});

describe("Checkout — referral", () => {
  it("prefers the captured ?ref= code and posts it normalized", async () => {
    localStorage.setItem(
      REFERRAL_STORAGE_KEY,
      JSON.stringify({ code: "PS-ABCDEF", at: Date.now() }),
    );
    render(
      createElement(
        LanguageProvider,
        null,
        createElement(CartProvider, null, createElement(CheckoutView)),
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId("referral-field")).toBeInTheDocument();
    });
    const field = screen
      .getByTestId("referral-field")
      .querySelector("input") as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe("PS-ABCDEF"));
    const body = await fillAndSubmit();
    expect(body.referral_code).toBe("ABCDEF");
  });

  it("clears the stored code once the order is placed", async () => {
    localStorage.setItem(
      REFERRAL_STORAGE_KEY,
      JSON.stringify({ code: "PS-ABCDEF", at: Date.now() }),
    );
    render(
      createElement(
        LanguageProvider,
        null,
        createElement(CartProvider, null, createElement(CheckoutView)),
      ),
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull();
    });
  });
});
