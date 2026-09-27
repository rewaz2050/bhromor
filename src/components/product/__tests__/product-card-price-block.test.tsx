/**
 * UX plan §1.1 (2026-09-26) — one price rule on every card: the saving as a
 * "Save 20%" chip next to the struck old price, and "Only 2 left" when the
 * row carries a real low count. Nothing is invented: no compare-at price →
 * no chip; no count and no low-stock flag → no scarcity line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProductCard from "@/components/product/product-card";
import { CartProvider } from "@/components/cart/cart-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { clearWishlistStore } from "@/lib/wishlist-store";
import { LanguageProvider } from "@/components/i18n/language-provider";

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

const base = PRODUCTS.find((item) => item.inStock)!;

beforeEach(() => {
  localStorage.clear();
  // the provider persists its language to a cookie — start each test clean
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  clearWishlistStore();
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => __resetLiveCatalog());
afterEach(cleanup);

const mount = (product: typeof base, lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>
    </LanguageProvider>,
  );

describe("ProductCard price block", () => {
  it("shows the saving chip from the shop's compare-at price (rounded percent)", () => {
    mount({ ...base, price: 120_000, compareAtPrice: 150_000, lowStock: false, stock: undefined });
    expect(screen.getByTestId("save-chip")).toHaveTextContent("Save 20%");
    expect(screen.queryByTestId("scarcity")).toBeNull();
  });

  it("no compare-at price → no chip; sold out → no scarcity line either", () => {
    mount({ ...base, compareAtPrice: undefined, inStock: false, lowStock: true, stock: 0 });
    expect(screen.queryByTestId("save-chip")).toBeNull();
    expect(screen.queryByTestId("scarcity")).toBeNull();
  });

  it("'Only 2 left' from a real count ≤ 3, 'Only a few left' from the low-stock flag alone", () => {
    const { unmount } = mount({ ...base, compareAtPrice: undefined, stock: 2, lowStock: true });
    expect(screen.getByTestId("scarcity")).toHaveTextContent("Only 2 left");
    unmount();
    mount({ ...base, compareAtPrice: undefined, stock: undefined, lowStock: true });
    expect(screen.getByTestId("scarcity")).toHaveTextContent("Only a few left");
  });

  it("uses Bengali digits in Bengali", () => {
    mount({ ...base, price: 120_000, compareAtPrice: 150_000, stock: 2, lowStock: true }, "bn");
    expect(screen.getByTestId("save-chip")).toHaveTextContent("২০% ছাড়");
    expect(screen.getByTestId("scarcity").textContent ?? "").toMatch(/২/);
    expect(screen.getByTestId("scarcity").textContent ?? "").not.toMatch(/\d/);
  });
});
