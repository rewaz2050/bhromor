/**
 * UX plan §9 (R11) — a shop's own shelf is browsable in place: category
 * chips (only what the shop stocks, with counts, from two categories up)
 * and the same sort as /shop.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ShopProducts from "@/components/shop/shop-products";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS, type Product, type Shop } from "@/lib/catalog";
import { sortShelf } from "@/lib/shop-sort";

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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
});

const mount = (products: Product[], lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <CartProvider>
        <ShopProducts products={products} shop={shop} zones={DELIVERY_ZONES} categories={CATEGORIES} />
      </CartProvider>
    </LanguageProvider>,
  );

const names = () =>
  screen.getAllByRole("article").map((card) => PRODUCTS.find((p) => within(card).queryByRole("link", { name: `View ${p.name}` }))?.name);

describe("<ShopProducts>", () => {
  it("offers the shop's own categories as chips with counts and filters the shelf", () => {
    mount(PRODUCTS);
    const chips = screen.getByTestId("shop-shelf-chips");
    const cats = [...new Set(PRODUCTS.map((p) => p.category))];
    expect(cats.length).toBeGreaterThanOrEqual(2);
    for (const id of cats) {
      const cat = CATEGORIES.find((c) => c.id === id)!;
      const label = cat.nameBn || cat.name;
      const chip = within(chips).getByRole("button", { name: new RegExp(`^${label}`) });
      expect(chip.textContent).toContain(String(PRODUCTS.filter((p) => p.category === id).length));
    }
    const first = CATEGORIES.find((c) => c.id === cats[0])!;
    fireEvent.click(within(chips).getByRole("button", { name: new RegExp(`^${first.nameBn || first.name}`) }));
    expect(names()).toEqual(sortShelf(PRODUCTS.filter((p) => p.category === cats[0]), "featured").map((p) => p.name));
  });

  it("sorts like /shop", () => {
    mount(PRODUCTS, "en");
    fireEvent.change(screen.getByTestId("shop-shelf-sort"), { target: { value: "price-asc" } });
    expect(names()).toEqual(sortShelf(PRODUCTS, "price-asc").map((p) => p.name));
    fireEvent.change(screen.getByTestId("shop-shelf-sort"), { target: { value: "price-desc" } });
    expect(names()).toEqual(sortShelf(PRODUCTS, "price-desc").map((p) => p.name));
  });

  it("a single-category shop gets no chips (nothing to narrow)", () => {
    const one = PRODUCTS.filter((p) => p.category === PRODUCTS[0]!.category);
    mount(one);
    expect(screen.queryByTestId("shop-shelf-chips")).toBeNull();
    expect(screen.getByTestId("shop-shelf-sort")).toBeInTheDocument();
  });
});

describe("sortShelf", () => {
  const items = [
    { id: "a", price: 300, inStock: true, featured: false, isNew: false, unitsSold: 2 },
    { id: "b", price: 100, inStock: false, featured: true, isNew: true, unitsSold: null },
    { id: "c", price: 200, inStock: true, featured: true, isNew: true, unitsSold: 9 },
  ];
  it("featured: in stock first, then featured, then arrival order; sold-out last", () => {
    expect(sortShelf(items, "featured").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
  it("newest: new pieces first, latest arrival first", () => {
    expect(sortShelf(items, "newest").map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
  it("best: real sales, rows without a figure last", () => {
    expect(sortShelf(items, "best").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
  it("price: both ways", () => {
    expect(sortShelf(items, "price-asc").map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(sortShelf(items, "price-desc").map((p) => p.id)).toEqual(["a", "c", "b"]);
  });
});
