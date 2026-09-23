/**
 * "Order again" — one tap, past order back in the bag, bag opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReorderButton from "../reorder-button";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";


vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  const products = PRODUCTS.map((p, i) => ({ ...p, shopId: i === 2 ? "s2" : "s1" }));
  return {
    useLiveCatalog: () => ({
      products,
      categories: CATEGORIES,
      shops: [
        { id: "s1", name: "Prosanti Fashion" },
        { id: "s2", name: "Bhromor Tailors" },
      ],
      live: true,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

function BagProbe() {
  const { lines, bagOpen } = useCart();
  return (
    <p data-testid="bag-probe">
      {bagOpen ? "open" : "closed"}:{lines.map((l) => `${l.productId}|${l.variantLabel}|${l.qty}`).join(",")}
    </p>
  );
}

const ui = (lines: React.ComponentProps<typeof ReorderButton>["lines"]) => (
  <LanguageProvider initialLang="en">
    <CartProvider>
      <BagProbe />
      <ReorderButton lines={lines} />
    </CartProvider>
  </LanguageProvider>
);

beforeEach(() => {
  window.localStorage.clear();
  __serveLiveCatalogForTests(
    PRODUCTS.map((p, i) => ({ ...p, shopId: i === 2 ? "s2" : "s1" })),
    CATEGORIES,
  );
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

describe("ReorderButton", () => {
  it("puts the old lines back in the bag, opens it and reports what was skipped", async () => {
    const p1 = PRODUCTS[0];
    render(
      ui([
        { productId: p1.id, variantLabel: "Forest Green · L", qty: 2, name: p1.name },
        { productId: "ghost", variantLabel: "Red · M", qty: 1, name: "Old Kurta" },
      ]),
    );
    fireEvent.click(screen.getByTestId("reorder-button"));
    const probe = await screen.findByTestId("bag-probe");
    expect(probe.textContent).toBe(`open:${p1.id}|Forest Green · L|2`);
    const result = screen.getByTestId("reorder-result");
    expect(result).toHaveTextContent("1 piece(s) back in your bag");
    expect(result).toHaveTextContent("Old Kurta — no longer listed");
  });

  it("asks before replacing another shop's bag, then replaces on confirm", async () => {
    const p1 = PRODUCTS[0]; // shop s1
    const p3 = PRODUCTS[2]; // shop s2
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([{ productId: p3.id, variantLabel: `${p3.colors[0]} · M`, qty: 1 }]),
    );
    render(ui([{ productId: p1.id, variantLabel: "Forest Green · M", qty: 1, name: p1.name }]));
    // wait for the stored bag to hydrate
    await screen.findByText(new RegExp(p3.id));
    fireEvent.click(screen.getByTestId("reorder-button"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Bhromor Tailors");
    // bag untouched until confirmed
    expect(screen.getByTestId("bag-probe").textContent).toContain(p3.id);
    fireEvent.click(screen.getByRole("button", { name: /replace & add/i }));
    expect(screen.getByTestId("bag-probe").textContent).toBe(`open:${p1.id}|Forest Green · M|1`);
  });
});
