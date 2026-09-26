/**
 * UX plan §6 (R5) — the receipt keeps the session alive: complements of
 * what was just bought, then the same shelves, never the ordered pieces;
 * and the checkout header promises a short form.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ReceiptRail, { RECEIPT_RAIL_MIN, receiptSuggestions } from "@/components/checkout/receipt-rail";
import CheckoutPageHeader from "@/components/checkout/checkout-page-header";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
});

const ordered = [PRODUCTS.find((p) => p.inStock)!];

describe("receiptSuggestions", () => {
  it("never repeats an ordered piece, stays in stock, and caps the row", () => {
    const items = receiptSuggestions(ordered, PRODUCTS);
    expect(items.length).toBeGreaterThanOrEqual(RECEIPT_RAIL_MIN);
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items.map((p) => p.id)).not.toContain(ordered[0].id);
    expect(items.every((p) => p.inStock)).toBe(true);
    expect(new Set(items.map((p) => p.id)).size).toBe(items.length);
  });

  it("is empty when the shop has nothing else", () => {
    expect(receiptSuggestions(ordered, ordered)).toEqual([]);
  });
});

describe("ReceiptRail + header cue", () => {
  it("renders the rail in Bengali with a continue-shopping link", () => {
    render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <ReceiptRail ordered={ordered} />
        </CartProvider>
      </LanguageProvider>,
    );
    const rail = screen.getByTestId("receipt-rail");
    expect(within(rail).getByRole("heading", { name: "আপনার পছন্দ হতে পারে" })).toBeVisible();
    expect(within(rail).getByRole("link", { name: /কেনাকাটা চালিয়ে যান/ })).toHaveAttribute("href", "/shop");
    expect(rail).toHaveAttribute("data-list", "receipt-rail");
  });

  it("says the form takes about a minute, in both languages", () => {
    render(
      <LanguageProvider initialLang="en">
        <CheckoutPageHeader />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("checkout-minute")).toHaveTextContent("About a minute");
    cleanup();
    localStorage.clear(); // the provider persisted "en" — start the Bengali render clean
    document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    render(
      <LanguageProvider initialLang="bn">
        <CheckoutPageHeader />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("checkout-minute")).toHaveTextContent("প্রায় ১ মিনিট");
  });
});
