/**
 * Quick-add sheet on a product card: a "Buy now" button sits beside
 * "Add to bag". Buy now adds the line and goes straight to checkout;
 * Add to bag stays on the page and opens the bag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PRODUCTS } from "@/lib/catalog";
import { pickSelectableSize } from "@/lib/size-stock";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import QuickAdd from "@/components/product/quick-add";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";

// A product the sheet can add straight away (no unselectable size gate).
const product = PRODUCTS.find(
  (p) => p.inStock && (p.sizes.length === 0 || !!pickSelectableSize(p, null)),
)!;

const renderSheet = () =>
  render(
    <LanguageProvider>
      <CartProvider>
        <QuickAdd product={product} onClose={vi.fn()} />
      </CartProvider>
    </LanguageProvider>,
  );

describe("quick-add sheet — Buy now", () => {
  beforeEach(() => {
    localStorage.clear();
    nav.push.mockClear();
  });
  afterEach(() => cleanup());

  it("shows Buy now next to Add to bag for an in-stock product", () => {
    renderSheet();
    expect(screen.getByTestId("quick-add-buy-now")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add to bag/i })).toBeTruthy();
  });

  it("Buy now adds the line and routes to /checkout", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("quick-add-buy-now"));
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("Add to bag does not navigate to checkout", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /add to bag/i }));
    expect(nav.push).not.toHaveBeenCalled();
  });
});
