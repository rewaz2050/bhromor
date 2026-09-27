/**
 * UX plan §4 (R11) — the shop grid: 24 cards a page with a "show more"
 * button (never infinite scroll — the footer stays reachable), an editorial
 * tile after every eighth card (a pattern interrupt that is NOT a card), and
 * the page count resets when the result set changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ShopBrowser, { SHOP_PAGE_SIZE } from "@/components/shop/shop-browser";
import { GRID_INTERRUPT_EVERY, gridInterruptFor } from "@/components/shop/grid-interrupt";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS, type Product, type Shop } from "@/lib/catalog";
import { toPublicShop } from "@/lib/shop-utils";

vi.mock("next/navigation", () => ({
  usePathname: () => "/shop",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const shop: Shop = {
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  tagline: "",
  phone: "01700000000",
  contactEmail: "owner@prosanti.store",
  address: "Sunamganj",
  zoneIds: DELIVERY_ZONES.map((z) => z.id),
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
};

/** 30 distinct pieces cloned from the seeds — enough for two pages. */
const many: Product[] = Array.from({ length: 30 }, (_, i) => {
  const base = PRODUCTS[i % PRODUCTS.length]!;
  return { ...base, id: `x${i}`, slug: `${base.slug}-${i}`, name: `${base.name} ${i}`, inStock: true };
});

const mount = (products: Product[], lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <ShopBrowser
          products={products}
          categories={CATEGORIES}
          shops={[toPublicShop(shop)]}
          zones={DELIVERY_ZONES}
          initialCategory="all"
          initialNew={false}
        />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
  window.history.replaceState(null, "", "/shop");
});

describe("shop grid — pages + interrupts", () => {
  it("shows one page, says how many more, and reveals the rest on tap", () => {
    mount(many);
    expect(screen.getAllByRole("article")).toHaveLength(SHOP_PAGE_SIZE);
    const row = screen.getByTestId("shop-show-more-row");
    expect(row.textContent).toContain(`${many.length}টির মধ্যে ${SHOP_PAGE_SIZE}টি`);
    const btn = screen.getByTestId("shop-show-more");
    expect(btn.textContent).toContain("আরও দেখুন");
    expect(btn.textContent).toContain(`আরও ${many.length - SHOP_PAGE_SIZE}টি`);
    fireEvent.click(btn);
    expect(screen.getAllByRole("article")).toHaveLength(many.length);
    expect(screen.queryByTestId("shop-show-more")).toBeNull();
  });

  it("puts an editorial tile after every eighth card, rotating, never as a card", () => {
    mount(many, "en");
    const tiles = screen.getAllByTestId("grid-interrupt");
    // 24 cards on the first page → after #8 and #16 (not after #24 — nothing follows it yet)
    expect(tiles).toHaveLength(Math.floor((SHOP_PAGE_SIZE - 1) / GRID_INTERRUPT_EVERY));
    expect(tiles[0]).toHaveAttribute("data-tile", gridInterruptFor(0));
    expect(tiles[1]).toHaveAttribute("data-tile", gridInterruptFor(1));
    expect(tiles[0]!.tagName).toBe("ASIDE");
    expect(within(tiles[0]!).getByRole("link")).toHaveAttribute("href", "/style");
    expect(within(tiles[1]!).getByRole("link")).toHaveAttribute("href", "/delivery");
    // the 9th grid child is the tile, so cards keep their order around it
    const grid = document.querySelector('[data-list="shop-grid"]')!;
    const children = Array.from(grid.children).filter((el) => el.tagName === "ARTICLE" || el.tagName === "ASIDE");
    expect(children[GRID_INTERRUPT_EVERY]!.tagName).toBe("ASIDE");
  });

  it("small result sets get neither a button nor a tile", () => {
    mount(PRODUCTS);
    expect(screen.queryByTestId("shop-show-more")).toBeNull();
    expect(screen.queryByTestId("grid-interrupt")).toBeNull();
  });

  it("a different result set starts at one page; the same one remembers its expansion", () => {
    // 40 pieces, 26 of them in one category → that category alone also needs a second page
    const men = Array.from({ length: 26 }, (_, i) => ({ ...many[0]!, id: `m${i}`, slug: `m-${i}`, name: `Men piece ${i}`, category: "men" as const }));
    const women = Array.from({ length: 14 }, (_, i) => ({ ...many[0]!, id: `w${i}`, slug: `w-${i}`, name: `Women piece ${i}`, category: "women" as const }));
    mount([...men, ...women], "en");
    fireEvent.click(screen.getByTestId("shop-show-more"));
    expect(screen.getAllByRole("article")).toHaveLength(40);
    // narrow → a new result set → one page again
    fireEvent.click(within(screen.getByTestId("category-chips")).getByRole("button", { name: /^Men/ }));
    expect(screen.getAllByRole("article")).toHaveLength(SHOP_PAGE_SIZE);
    expect(screen.getByTestId("shop-show-more").textContent).toContain("2 more");
    // widen back → the set the shopper already expanded stays expanded
    fireEvent.click(within(screen.getByTestId("category-chips")).getByRole("button", { name: /^All/ }));
    expect(screen.getAllByRole("article")).toHaveLength(40);
  });
});
