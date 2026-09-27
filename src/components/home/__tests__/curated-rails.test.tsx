/**
 * UX plan §2 (R3) — the two curated rails after the category row: best
 * sellers ranked by REAL orders (hidden until two genuine sellers), new
 * arrivals hidden until a real row of them, never repeating a best seller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CuratedRails, { NEW_RAIL_MIN } from "@/components/home/curated-rails";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS, type Product } from "@/lib/catalog";
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

const live = PRODUCTS.filter((p) => p.inStock);

const ui = (pool: Product[], lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <CuratedRails pool={pool} />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => {
  cleanup();
  __resetLiveCatalog();
});

describe("CuratedRails", () => {
  it("renders nothing without real sellers or a real row of new pieces", () => {
    const pool = live.slice(0, 3).map((p) => ({ ...p, unitsSold: undefined, isNew: false }));
    const { container } = ui(pool);
    expect(container.querySelector("section")).toBeNull();
    expect(pool.length).toBeLessThan(NEW_RAIL_MIN);
  });

  it("ranks best sellers by units sold and keeps them out of the new-arrivals rail", () => {
    const pool = live.slice(0, 8).map((p, i) => ({
      ...p,
      unitsSold: i === 0 ? 5 : i === 1 ? 9 : undefined,
      isNew: i >= 2,
    }));
    ui(pool);
    const best = screen.getByTestId("rail-best-sellers");
    expect(within(best).getByRole("heading", { name: "Best sellers" })).toBeVisible();
    const slugs = (root: HTMLElement) =>
      within(root)
        .getAllByTestId("card-peek")
        .map((a) => a.getAttribute("href")?.replace("/product/", ""));
    expect(slugs(best)).toEqual([pool[1].slug, pool[0].slug]);
    expect(within(best).getByRole("link", { name: /See all best sellers/ })).toHaveAttribute(
      "href",
      "/shop?sort=best",
    );
    expect(best).toHaveAttribute("data-list", "best-sellers-rail");

    const fresh = screen.getByTestId("rail-new-arrivals");
    expect(slugs(fresh)).toEqual(pool.slice(2).map((p) => p.slug));
    expect(slugs(fresh)).not.toContain(pool[0].slug);
    expect(within(fresh).getByRole("link", { name: /See all new arrivals/ })).toHaveAttribute(
      "href",
      "/shop?sort=newest",
    );
  });

  it("hides the best-seller rail with a single seller, and speaks Bengali", () => {
    const pool = live.slice(0, 6).map((p, i) => ({ ...p, unitsSold: i === 0 ? 3 : undefined, isNew: true }));
    ui(pool, "bn");
    expect(screen.queryByTestId("rail-best-sellers")).toBeNull();
    const fresh = screen.getByTestId("rail-new-arrivals");
    expect(within(fresh).getByRole("heading", { name: "নতুন এসেছে" })).toBeVisible();
  });
});
