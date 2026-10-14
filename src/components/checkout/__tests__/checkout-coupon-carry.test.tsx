/**
 * UX plan §3 (R11) — the promo code copied on the offers card is PLACED in
 * checkout's coupon field (a guest still taps Apply — auto-apply stays an
 * account perk); once applied the carried code is forgotten.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveAuthForTests } from "@/lib/customer-session";
import { COUPON_CARRY_KEY, carriedCoupon, rememberCoupon } from "@/lib/coupon-carry";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let validateCalls = 0;

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/products")) {
    return Promise.resolve(jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }));
  }
  if (url.includes("/api/zones")) return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  if (url.includes("/api/account/me")) return Promise.resolve(jsonResponse({ customer: null }, 401));
  if (url.includes("/api/coupons/best")) return Promise.resolve(jsonResponse({ error: "sign in" }, 401));
  if (url.includes("/api/coupons/validate")) {
    validateCalls += 1;
    return Promise.resolve(
      jsonResponse({ valid: true, code: "EID10", discount: 10000, description: "Ten off", freeDelivery: false }),
    );
  }
  return Promise.resolve(jsonResponse({}));
};

const mount = () =>
  render(
    <LanguageProvider initialLang="bn">
      <CartProvider>
        <CheckoutView />
      </CartProvider>
    </LanguageProvider>,
  );

const ready = () => waitFor(() => expect(screen.getByTestId("more-options")).toBeInTheDocument());

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __resetLiveAuthForTests();
  validateCalls = 0;
  vi.stubGlobal("fetch", mockFetch);
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 }]),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetLiveAuthForTests();
});

describe("coupon carry (offers card → checkout)", () => {
  it("guest: the copied code sits in the field with a hint, is NOT applied by itself, applies on tap and is then forgotten", async () => {
    rememberCoupon("eid10");
    mount();
    await ready();
    const more = screen.getByTestId("more-options");
    const input = (await within(more).findByPlaceholderText(
      "Coupon code",
    )) as HTMLInputElement;
    // The carry lands in a post-mount effect gated on the view's own `ready`
    // flag, which can flip one render after the panel is already in the DOM.
    // Read synchronously that is a race — it passed locally and failed on a
    // loaded CI runner (2026-10-10) with the field still empty.
    await waitFor(() => expect(input.value).toBe("EID10"));
    await waitFor(() =>
      expect(within(more).getByTestId("coupon-carried").textContent).toContain("Apply চাপুন"),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(validateCalls).toBe(0);
    expect(within(more).queryByTestId("coupon-applied")).toBeNull();

    fireEvent.click(within(more).getByRole("button", { name: /Apply|প্রয়োগ|বসান/i }));
    await waitFor(() => expect(within(more).getByTestId("coupon-applied")).toBeInTheDocument(), { timeout: 4000 });
    expect(within(more).getByTestId("coupon-applied").textContent).toContain("EID10");
    expect(validateCalls).toBe(1);
    expect(carriedCoupon()).toBeNull();
    expect(window.localStorage.getItem(COUPON_CARRY_KEY)).toBeNull();
  });

  it("a stale carry (older than a day) is ignored and dropped", async () => {
    rememberCoupon("OLD5", Date.now() - 25 * 3600_000);
    mount();
    await ready();
    const more = screen.getByTestId("more-options");
    expect(within(more).queryByTestId("coupon-carried")).toBeNull();
    expect(carriedCoupon()).toBeNull();
  });
});
