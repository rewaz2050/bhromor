/** UX plan §10 (R7) — /live is never an empty room. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import LiveView from "@/components/live/live-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { newArrivals } from "@/lib/home-shelves";

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
const mount = (lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <LiveView />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  catalog.products = PRODUCTS;
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  // /api/live: nothing on air, nothing scheduled.
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ live: null, upcoming: null }), { status: 200 }))) as typeof fetch;
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  globalThis.fetch = originalFetch;
});

describe("<LiveView> with no session", () => {
  it("says so honestly and then puts the new arrivals on stage, newest first, in Bengali", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/No live shopping right now/)).toBeTruthy());
    const rail = screen.getByTestId("live-new-rail");
    expect(within(rail).getByRole("link", { name: /সব নতুন আসা দেখুন/ })).toHaveAttribute("href", "/shop?filter=new");
    const hrefs = within(rail)
      .getAllByTestId("card-peek")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(newArrivals(PRODUCTS, 8).map((p) => `/product/${p.slug}`));
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not invent a rail when the catalog has nothing orderable", async () => {
    catalog.products = PRODUCTS.map((p) => ({ ...p, inStock: false }));
    mount("en");
    await waitFor(() => expect(screen.getByText(/No live shopping right now/)).toBeTruthy());
    expect(screen.queryByTestId("live-new-rail")).toBeNull();
  });
});
