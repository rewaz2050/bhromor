/**
 * Empty states that bring shoppers back in — the empty cart page shows the
 * pieces this device recently viewed (a returning shopper's quiet way back);
 * a first visit (nothing viewed) sees nothing extra.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CartView from "@/components/cart/cart-view";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import {
  __resetLiveCatalog,
  __serveLiveCatalogForTests,
} from "@/lib/live-catalog";
import {
  __resetRecentlyViewed,
  recordView,
  RECENTLY_VIEWED_KEY,
} from "@/lib/recently-viewed";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";

const OpenBag = () => {
  const { openBag } = useCart();
  return (
    <button type="button" onClick={openBag} data-testid="open-bag">
      open-bag
    </button>
  );
};

beforeEach(() => {
  localStorage.clear();
  __resetRecentlyViewed();
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});

afterEach(() => {
  __resetLiveCatalog();
  cleanup();
});

const renderCart = () =>
  render(
    <CartProvider>
      <OpenBag />
      <CartView />
    </CartProvider>,
  );

describe("CartView — the empty cart points back at pieces you liked", () => {
  it("shows the recently-viewed strip for a returning device", () => {
    recordView(PRODUCTS[0]!.id);
    recordView(PRODUCTS[3]!.id);
    expect(localStorage.getItem(RECENTLY_VIEWED_KEY)).not.toBeNull();

    renderCart();
    const strip = screen.getByTestId("recently-viewed-strip");
    expect(strip).toBeVisible();
    expect(strip).toHaveTextContent(PRODUCTS[0]!.name);
    expect(strip).toHaveTextContent(PRODUCTS[3]!.name);
  });

  it("a first visit (nothing viewed) sees only the empty state", () => {
    renderCart();
    expect(screen.getByText(/empty/i) ?? screen.getAllByRole("heading")[0]).toBeTruthy();
    expect(screen.queryByTestId("recently-viewed-strip")).toBeNull();
  });
});
