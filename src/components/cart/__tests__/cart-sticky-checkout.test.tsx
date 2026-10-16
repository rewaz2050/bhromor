/**
 * UI/UX pass 2026-10-15 — on a phone the order summary stacks under the line
 * items, so a bag with a few pieces pushed "Proceed to checkout" below the
 * fold. The cart now carries its own sticky bar (the listing pages'
 * mini-bar deliberately skips /cart), and it must not appear for an empty
 * bag — on desktop the sticky aside already holds the action.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CartView from "@/components/cart/cart-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import {
  __resetLiveCatalog,
  __serveLiveCatalogForTests,
} from "@/lib/live-catalog";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { translations } from "@/lib/translations";

const inStock = PRODUCTS.filter((p) => p.inStock);

const seedBag = (count: number) =>
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify(
      inStock.slice(0, count).map((p) => ({
        productId: p.id,
        variantLabel: `${p.colors[0]} · ${p.sizes[0]}`,
        qty: 1,
      })),
    ),
  );

beforeEach(() => {
  window.localStorage.clear();
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
});

const mount = () =>
  render(
    <LanguageProvider initialLang="bn">
      <CartProvider>
        <CartView />
      </CartProvider>
    </LanguageProvider>,
  );

describe("CartView — sticky checkout on phones", () => {
  it("keeps the total and the checkout in reach once the bag has pieces", async () => {
    seedBag(3);
    mount();
    const bar = await screen.findByTestId("cart-sticky-checkout");

    // The primary action is one tap away, wherever the shopper has scrolled.
    // (Scoped to the bar: the desktop aside carries a second checkout link.)
    const link = within(bar).getByRole("link", {
      name: new RegExp(translations.bn.cart.proceedToCheckout),
    });
    expect(link).toHaveAttribute("href", "/checkout");

    // ...and it quotes a total, in Bangla digits for a Bangla reader.
    expect(bar).toHaveTextContent("৳");
    expect(bar.textContent).toMatch(/[০-৯]/);
  });

  it("renders nothing for an empty bag", async () => {
    mount();
    // The empty state is on screen, so the tree has settled.
    await screen.findByRole("link", {
      name: new RegExp(translations.bn.cart.exploreProducts),
    });
    expect(screen.queryByTestId("cart-sticky-checkout")).toBeNull();
  });
});
