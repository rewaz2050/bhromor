/**
 * P2 #19 — the bag drawer ends in ONE primary action. "View bag" and the
 * WhatsApp order still exist, folded under a quiet "more ways" row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BagDrawer from "@/components/cart/bag-drawer";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
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

function OpenBag() {
  const { openBag } = useCart();
  return (
    <button type="button" onClick={openBag}>
      open-bag
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 }]),
  );
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
  );
});

afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("BagDrawer — one primary CTA (P2 #19)", () => {
  it("shows Checkout as the only full-width button; the rest folds under 'More ways to order'", async () => {
    render(
      <CartProvider>
        <OpenBag />
        <BagDrawer />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open-bag" }));
    const dialog = await screen.findByRole("dialog", { name: "Your Bag" });
    expect(within(dialog).getByTestId("bag-checkout")).toHaveAttribute("href", "/checkout");
    const more = within(dialog).getByTestId("bag-more-ways") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    // "View bag" is still reachable — one tap away, not competing.
    expect(within(more).getByRole("link", { name: "View bag" })).toHaveAttribute("href", "/cart");
    // Exactly one editorial (primary) button in the footer.
    const primary = dialog.querySelectorAll("a.editorial-button");
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toMatch(/Checkout/);
  });
});
