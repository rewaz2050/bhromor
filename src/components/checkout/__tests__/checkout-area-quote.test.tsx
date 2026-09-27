/**
 * UX plan §6 (R11) — the moment an area is typed, the delivery charge and
 * the clock appear RIGHT under the field (same numbers as the summary),
 * not two steps later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/products")) {
    return Promise.resolve(jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }));
  }
  if (url.includes("/api/zones")) return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  if (url.includes("/api/account/me")) return Promise.resolve(jsonResponse({ customer: null }, 401));
  return Promise.resolve(jsonResponse({}));
};

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
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
});

describe("area quote (checkout step ①)", () => {
  it("shows zone, charge and ETA under the para field as soon as it is filled — matching the summary", async () => {
    render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <CheckoutView />
        </CartProvider>
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("more-options")).toBeInTheDocument());
    expect(screen.queryByTestId("area-quote")).toBeNull();
    expect(screen.getByText(/পাড়া বা গ্রামের নাম লিখলেই/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), { target: { value: "Boropara" } });
    const quote = await screen.findByTestId("area-quote");
    expect(quote).toHaveAttribute("data-zone", "z1");
    expect(quote.textContent).toContain("ডেলিভারি");
    // the same charge the summary quotes
    const summaryCharge = screen.getAllByTestId("delivery-charge")[0]!.textContent?.replace(/\s+/g, " ").trim();
    const digits = (s: string | undefined | null) => (s ?? "").replace(/[^\d০-৯]/g, "");
    expect(digits(quote.textContent)).toContain(digits(summaryCharge).slice(0, 2));
    expect(quote.textContent).toMatch(/min|মিনিট|hr|ঘণ্টা|দিন|day/i);
  });
});
