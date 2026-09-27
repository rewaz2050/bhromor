/** UX plan §10 (R7) — one offers hub, honest when nothing is on. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import OffersHub, { bundleAnchor } from "@/components/offers/offers-hub";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS, type Product } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { offerProducts } from "@/lib/home-shelves";

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

const originalFetch = globalThis.fetch;
const mount = (pool: Product[], lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <OffersHub pool={pool} />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  catalog.products = PRODUCTS;
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  // Promo / CMS / zone fetches: nothing switched on, nothing running.
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  globalThis.fetch = originalFetch;
});

describe("bundleAnchor", () => {
  it("is the first in-stock piece that really has complements, or null", () => {
    const anchor = bundleAnchor(PRODUCTS)!;
    expect(anchor).toBeTruthy();
    expect(anchor.inStock).toBe(true);
    expect(bundleAnchor(PRODUCTS.map((p) => ({ ...p, inStock: false })))).toBeNull();
  });
});

describe("<OffersHub>", () => {
  it("lists every marked-down piece biggest saving first, the set of the week, and the new rail", () => {
    mount(PRODUCTS);
    const hub = screen.getByTestId("offers-hub");
    expect(within(hub).getByRole("heading", { level: 1, name: "অফার" })).toBeVisible();
    const grid = screen.getByTestId("offers-grid");
    const hrefs = within(grid)
      .getAllByTestId("card-peek")
      .map((a) => a.getAttribute("href"));
    const expected = offerProducts(PRODUCTS, 0).map((p) => `/product/${p.slug}`);
    expect(expected.length).toBeGreaterThan(1);
    expect(hrefs).toEqual(expected);
    // Bengali digits in the count line.
    expect(within(grid).getByText(/^[০-৯]+টি পিস$/)).toBeInTheDocument();
    expect(within(grid).getByRole("link", { name: /শপ-গ্রিডে অফারগুলো খুলুন/ })).toHaveAttribute(
      "href",
      "/shop?filter=sale",
    );
    expect(screen.getByTestId("offers-set")).toBeInTheDocument();
    expect(screen.getByTestId("offers-new-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("offers-empty")).not.toBeInTheDocument();
  });

  it("says so honestly when nothing is on, and still offers what is new", () => {
    const flat = PRODUCTS.map((p) => ({ ...p, compareAtPrice: undefined, subCategory: "Solo" }));
    catalog.products = flat;
    mount(flat, "en");
    expect(screen.queryByTestId("offers-grid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offers-set")).not.toBeInTheDocument();
    const empty = screen.getByTestId("offers-empty");
    expect(within(empty).getByRole("heading", { name: "No offer is running right now" })).toBeVisible();
    expect(within(empty).getByRole("link", { name: /Browse the shop/ })).toHaveAttribute("href", "/shop");
    expect(screen.getByTestId("offers-new-rail")).toBeInTheDocument();
  });
});
