/** UX plan §11 + §1.4 (R8) — information pages and the 404 end in product. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import InfoRail from "@/components/info/info-rail";
import NotFoundView from "@/components/info/not-found-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { bestSellers, newArrivals } from "@/lib/home-shelves";

const catalog = vi.hoisted(() => ({ products: [] as unknown[] }));
vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: catalog.products,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

const wrap = (node: React.ReactNode, lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>{node}</CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  catalog.products = PRODUCTS;
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
});

const hrefsIn = (el: HTMLElement) => within(el).getAllByTestId("card-peek").map((a) => a.getAttribute("href"));

describe("<InfoRail>", () => {
  it("shows the best sellers when sales data exists, linking to the sorted shop", () => {
    const sold = PRODUCTS.map((p, i) => ({ ...p, unitsSold: 50 - i }));
    catalog.products = sold;
    wrap(<InfoRail />, "en");
    const rail = screen.getByTestId("info-rail");
    expect(within(rail).getByRole("link", { name: /See all best sellers/ })).toHaveAttribute("href", "/shop?sort=best");
    expect(hrefsIn(rail)).toEqual(bestSellers(sold, 8).map((p) => `/product/${p.slug}`));
  });

  it("falls back to new arrivals while sales are thin, and stays away without stock", () => {
    const unsold = PRODUCTS.map((p) => ({ ...p, unitsSold: 0 }));
    catalog.products = unsold;
    wrap(<InfoRail />);
    const rail = screen.getByTestId("info-rail");
    expect(hrefsIn(rail)).toEqual(newArrivals(unsold, 8).map((p) => `/product/${p.slug}`));
    cleanup();

    catalog.products = PRODUCTS.map((p) => ({ ...p, inStock: false }));
    wrap(<InfoRail />);
    expect(screen.queryByTestId("info-rail")).toBeNull();
  });
});

describe("<NotFoundView>", () => {
  it("speaks Bengali by default (Bengali digits), points back to the shop and ends with the shelf", () => {
    wrap(<NotFoundView />);
    const box = screen.getByTestId("not-found");
    expect(box.textContent).toContain("৪০৪");
    expect(box.textContent).not.toMatch(/[0-9]/);
    expect(within(box).getByRole("link", { name: /কালেকশনে ফিরুন/ })).toHaveAttribute("href", "/shop");
    expect(screen.getByTestId("info-rail")).toBeTruthy();
  });
});
