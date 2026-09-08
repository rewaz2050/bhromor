import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ShopBrowser from "@/components/shop/shop-browser";
import { CartProvider } from "@/components/cart/cart-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { bdt } from "@/lib/format";

vi.mock("next/navigation", () => ({
  usePathname: () => "/shop",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const renderShop = (props?: Partial<React.ComponentProps<typeof ShopBrowser>>) =>
  render(
    <CartProvider>
      <ShopBrowser
        products={PRODUCTS}
        categories={CATEGORIES}
        initialCategory="all"
        initialNew={false}
        {...props}
      />
    </CartProvider>,
  );

const gridNames = () =>
  screen
    .getAllByRole("article")
    .map((card) => within(card).getAllByRole("link")[1]?.textContent?.trim() ?? "");

describe("ShopBrowser", () => {
  beforeEach(() => cleanup());

  it("respects BOTH bounds of a price band", () => {
    renderShop();
    fireEvent.click(screen.getAllByLabelText(/৳1,000 – ৳1,500/)[0]);

    const shown = PRODUCTS.filter((p) =>
      gridNames().includes(p.name),
    );
    expect(shown.length).toBeGreaterThan(0);
    for (const p of shown) {
      expect(p.price).toBeGreaterThanOrEqual(bdt(1000));
      expect(p.price).toBeLessThan(bdt(1500));
    }
    // A cheap item must NOT leak into the band (the old "max only" bug).
    const cheapest = [...PRODUCTS].sort((a, b) => a.price - b.price)[0];
    if (cheapest.price < bdt(1000)) {
      expect(gridNames()).not.toContain(cheapest.name);
    }
  });

  it("sorts 'Newest' by new arrivals, not by reversing the list", () => {
    renderShop();
    fireEvent.change(screen.getByLabelText(/sort products/i), {
      target: { value: "newest" },
    });

    const names = gridNames();
    const newNames = PRODUCTS.filter((p) => p.isNew).map((p) => p.name);
    const firstFew = names.slice(0, newNames.length);
    for (const name of firstFew) expect(newNames).toContain(name);
  });

  it("re-applies filters when the URL changes (header 'New Arrivals' link)", () => {
    const { rerender } = renderShop({ initialCategory: "men" });
    expect(screen.getByText(/products in men/i)).toBeInTheDocument();

    rerender(
      <CartProvider>
        <ShopBrowser
          products={PRODUCTS}
          categories={CATEGORIES}
          initialCategory="all"
          initialNew
        />
      </CartProvider>,
    );

    expect(screen.getByText(/new arrivals/i)).toBeInTheDocument();
    for (const name of gridNames()) {
      expect(PRODUCTS.find((p) => p.name === name)?.isNew).toBe(true);
    }
  });

  it("offers only sizes and colours that exist in the catalog", () => {
    renderShop();
    const catalogColors = new Set(PRODUCTS.flatMap((p) => p.colors));
    for (const color of catalogColors) {
      expect(screen.getAllByRole("button", { name: color }).length).toBeGreaterThan(0);
    }
    // A colour no product carries must not be offered.
    expect(catalogColors.has("Fluorescent Pink")).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Fluorescent Pink" }),
    ).toBeNull();
  });

  it("shows an empty state and can clear filters again", () => {
    renderShop();
    fireEvent.change(screen.getByLabelText(/search products/i), {
      target: { value: "zzzz-not-a-product" },
    });
    expect(screen.getByText(/no products found/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.queryByText(/no products found/i)).toBeNull();
  });
});
