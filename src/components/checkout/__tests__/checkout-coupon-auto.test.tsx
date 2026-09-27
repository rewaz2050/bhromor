/**
 * UX plan §5 (R9) — coupon auto-apply is an account perk (owner decision
 * 2026-09-27): a signed-in customer gets the best redeemable code placed
 * by itself, a guest is told why signing in pays and never triggers the
 * search; a removed code is not put back behind the shopper's back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveAuthForTests } from "@/lib/customer-session";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let customer: { id: string; name: string; phone: string } | null = null;
let bestCalls = 0;
let bestAnswer: Record<string, unknown> = { none: true };

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/products")) {
    return Promise.resolve(jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }));
  }
  if (url.includes("/api/zones")) return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  if (url.includes("/api/account/me")) {
    return Promise.resolve(customer ? jsonResponse({ customer }) : jsonResponse({ customer: null }, 401));
  }
  if (url.includes("/api/coupons/best")) {
    bestCalls += 1;
    return Promise.resolve(customer ? jsonResponse(bestAnswer) : jsonResponse({ error: "sign in" }, 401));
  }
  if (url.includes("/api/coupons/validate")) {
    return Promise.resolve(
      jsonResponse({ valid: true, code: "SAVE10", discount: 10000, description: "Ten off", freeDelivery: false }),
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
  customer = null;
  bestCalls = 0;
  bestAnswer = { none: true };
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

describe("coupon auto-apply — signed-in only", () => {
  it("guest: sees the sign-in nudge, the search never runs, typing a code still works", async () => {
    mount();
    await ready();
    const more = screen.getByTestId("more-options");
    const nudge = await within(more).findByTestId("coupon-login-nudge");
    expect(within(nudge).getByRole("link")).toHaveAttribute("href", "/account?next=/checkout");
    expect(nudge.textContent).toContain("লগইন");
    await new Promise((r) => setTimeout(r, 700));
    expect(bestCalls).toBe(0);
    expect(within(more).queryByTestId("coupon-auto")).toBeNull();
    // Manual path untouched.
    expect(within(more).getByPlaceholderText("Coupon code")).toBeInTheDocument();
  });

  it("signed in: the best coupon lands by itself with an 'auto' chip; removing it stops the auto-search", async () => {
    customer = { id: "c1", name: "রহিম", phone: "01712345678" };
    bestAnswer = { code: "SAVE10", freeDelivery: false, description: "Ten off" };
    mount();
    await ready();
    const more = screen.getByTestId("more-options");
    await waitFor(() => expect(within(more).getByTestId("coupon-applied")).toBeInTheDocument(), { timeout: 4000 });
    expect(within(more).getByTestId("coupon-applied").textContent).toContain("SAVE10");
    expect(within(more).getByTestId("coupon-auto")).toBeInTheDocument();
    expect(bestCalls).toBe(1);
    expect(within(more).queryByTestId("coupon-login-nudge")).toBeNull();

    fireEvent.click(within(more).getByRole("button", { name: /Remove|সরান/i }));
    await waitFor(() => expect(within(more).queryByTestId("coupon-applied")).toBeNull());
    await new Promise((r) => setTimeout(r, 800));
    expect(bestCalls).toBe(1);
    expect(within(more).getByPlaceholderText("Coupon code")).toBeInTheDocument();
  });

  it("signed in with nothing applicable: says so quietly, once per cart shape", async () => {
    customer = { id: "c1", name: "রহিম", phone: "01712345678" };
    mount();
    await ready();
    const more = screen.getByTestId("more-options");
    await waitFor(() => expect(within(more).getByTestId("coupon-auto-status")).toBeInTheDocument(), { timeout: 4000 });
    expect(within(more).getByTestId("coupon-auto-status").textContent).toContain("কোনো কুপন খাটে না");
    await new Promise((r) => setTimeout(r, 700));
    expect(bestCalls).toBe(1);
  });
});
