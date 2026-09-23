/**
 * Tap feedback — the header bag icon bounces when the bag changes (key
 * remount replays the CSS pop), and the badge still announces the count.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import CartButton from "@/components/layout/cart-button";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import {
  __resetLiveCatalog,
  __serveLiveCatalogForTests,
} from "@/lib/live-catalog";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";

const Adder = () => {
  const { addItem } = useCart();
  return (
    <button
      type="button"
      onClick={() => addItem(PRODUCTS[0]!.id, `${PRODUCTS[0]!.colors[0]} · ${PRODUCTS[0]!.sizes[0]}`, 1)}
    >
      add-one
    </button>
  );
};

beforeEach(() => {
  localStorage.clear();
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  __resetLiveCatalog();
  cleanup();
});

describe("CartButton — the bag answers a bag change", () => {
  it("the icon wrapper carries the pop class keyed by count (empty bag → quiet)", () => {
    const { container } = render(
      <CartProvider>
        <Adder />
        <CartButton />
      </CartProvider>,
    );
    const quiet = container.querySelector(".bag-pop");
    expect(quiet).toBeNull();

    fireEvent.click(screen.getByText("add-one"));
    const popped = container.querySelector(".bag-pop");
    expect(popped).not.toBeNull();
    expect(screen.getByRole("button", { name: /Open bag, 1 item/ })).toBeVisible();

    // A second add remounts the wrapper (new key) so the animation replays.
    fireEvent.click(screen.getByText("add-one"));
    expect(container.querySelector(".bag-pop")).not.toBeNull();
    expect(screen.getByText("2")).toBeVisible();
  });
});
