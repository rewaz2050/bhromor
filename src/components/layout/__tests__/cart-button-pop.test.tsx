/**
 * The bag badge (flicker pass 2026-10-07): it celebrates a CHANGE, not a
 * page load. A stored bag used to make the badge bounce on every page the
 * shopper opened, because "0 → 3" looked exactly like "you just added".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CartButton from "@/components/layout/cart-button";
import { CartProvider } from "@/components/cart/cart-provider";
import { CART_STORAGE_KEY, type CartLine } from "@/lib/cart";
import { __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { PRODUCTS } from "@/lib/catalog";

const bag = (qty: number): CartLine[] => [
  { productId: PRODUCTS[0].id, variantLabel: "Green · L", qty },
];

const icon = () => screen.getByRole("button", { name: /Open bag/ }).firstElementChild!;

beforeEach(() => {
  localStorage.clear();
  // A bag only counts pieces the catalog knows — stock it like production.
  __serveLiveCatalogForTests(PRODUCTS);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CartButton", () => {
  it("does not pop when the stored bag is simply read on load", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(bag(1)));
    render(
      <CartProvider>
        <CartButton />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(icon().className).not.toContain("bag-pop");
  });

  it("pops when the bag really changes in front of the shopper", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(bag(1)));
    render(
      <CartProvider>
        <CartButton />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    // Another tab (or another screen) adds one: the badge should say so.
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(bag(2)));
    window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY }));
    await waitFor(() => expect(icon().className).toContain("bag-pop"));
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
