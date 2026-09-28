/**
 * A1 — /shops search, sort and filters (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 * Pure module, so every honesty rule is asserted here rather than clicked through.
 */
import { describe, expect, it } from "vitest";
import {
  directoryCategories,
  filterShopsForDirectory,
  shopMatchesQuery,
  shopStockedCategories,
  sortShops,
  type ShopDirectoryFilters,
} from "@/lib/shop-directory";
import { CATEGORIES, PRODUCTS, type Category, type Product, type Shop } from "@/lib/catalog";

const shop = (over: Partial<Shop>): Shop => ({
  id: "s1",
  slug: "s1",
  name: "Shop One",
  phone: "01711111111",
  zoneIds: ["z1", "z2"],
  prepMinutes: 15,
  commissionPct: 10,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
});

const SHOPS: Shop[] = [
  shop({ id: "a", slug: "arian", name: "Arian Fashion", tagline: "পাঞ্জাবি ও শাড়ি", zoneIds: ["z1"], ratingAvg: 4.8, ratingCount: 40 }),
  shop({ id: "b", slug: "boropara", name: "Boropara Threads", tagline: "Everyday panjabi", zoneIds: ["z3"], ratingAvg: 4.2, ratingCount: 5 }),
  shop({ id: "c", slug: "cholontika", name: "Cholontika", zoneIds: ["z1"], ratingAvg: 5, ratingCount: 0 }),
];

const COUNTS: Record<string, number> = { a: 2, b: 9, c: 5 };
const CATS: Record<string, string[]> = { a: ["men", "women"], b: ["men"], c: ["heritage"] };

const filters = (over: Partial<ShopDirectoryFilters> = {}): ShopDirectoryFilters => ({
  q: "",
  sort: "recommended",
  categoryId: null,
  zoneId: null,
  onlyServingZone: false,
  ...over,
});

describe("shopMatchesQuery", () => {
  it("matches name and tagline, case-insensitively, and needs every word", () => {
    expect(shopMatchesQuery(SHOPS[0], "arian")).toBe(true);
    expect(shopMatchesQuery(SHOPS[0], "ARIAN  fashion")).toBe(true);
    expect(shopMatchesQuery(SHOPS[0], "Arian wardrobe")).toBe(false);
    expect(shopMatchesQuery(SHOPS[1], "panjabi")).toBe(true);
    expect(shopMatchesQuery(SHOPS[1], "শাড়ি")).toBe(false);
    expect(shopMatchesQuery(SHOPS[1], "   ")).toBe(true);
  });
});

describe("sortShops", () => {
  it("'Top rated' puts reviewed shops first — 0 reviews is not a 5-star shop", () => {
    const order = sortShops(SHOPS, "rating", COUNTS, null).map((s) => s.id);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("'Biggest shelf' ranks by product count, then name", () => {
    expect(sortShops(SHOPS, "shelf", COUNTS, null).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("'Recommended' floats zone-serving shops first even when unreviewed", () => {
    const order = sortShops(SHOPS, "recommended", COUNTS, "z3").map((s) => s.id);
    expect(order[0]).toBe("b");
    // Reviewed shops then rank above the unreviewed one.
    expect(order.slice(1)).toEqual(["a", "c"]);
  });

  it("sorts by name as the last option", () => {
    expect(sortShops(SHOPS, "name", COUNTS, null).map((s) => s.name)).toEqual([
      "Arian Fashion",
      "Boropara Threads",
      "Cholontika",
    ]);
  });
});

describe("shopStockedCategories", () => {
  it("groups catalog rows per shop, with orphan rows on the fallback shop", () => {
    const products: Product[] = [
      { ...PRODUCTS[0], shopId: "a", category: "men" },
      { ...PRODUCTS[1], shopId: "a", category: "women" },
      { ...PRODUCTS[2], shopId: "b", category: "men" },
      { ...PRODUCTS[3], shopId: undefined, category: "heritage" },
    ];
    expect(shopStockedCategories(products, "fallback")).toEqual({
      a: ["men", "women"],
      b: ["men"],
      fallback: ["heritage"],
    });
  });

  it("offers chips only for categories a shop actually stocks", () => {
    const chips = directoryCategories(CATEGORIES, { a: ["men"], b: ["men", "women"] });
    expect(chips.map((c) => c.id)).toEqual(["men", "women"]);
    // A category the catalog does not know keeps its id instead of vanishing.
    const withUnknown: Category[] = CATEGORIES;
    const unknownChips = directoryCategories(withUnknown, { a: ["new-cat"] });
    expect(unknownChips.map((c) => c.id)).toEqual(["new-cat"]);
    expect(unknownChips[0].nameBn).toBe("new-cat");
    // No stocking shop at all → no chips (nothing to filter by).
    expect(directoryCategories(CATEGORIES, {})).toEqual([]);
  });
});

describe("filterShopsForDirectory", () => {
  it("combines search + category, and counts what the area toggle hides", () => {
    const all = filterShopsForDirectory(SHOPS, COUNTS, CATS, filters());
    expect(all.shops.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(all.hiddenByZone).toBe(0);

    const category = filterShopsForDirectory(SHOPS, COUNTS, CATS, filters({ categoryId: "men" }));
    expect(category.shops.map((s) => s.id)).toEqual(["a", "b"]);

    const zone = filterShopsForDirectory(
      SHOPS,
      COUNTS,
      CATS,
      filters({ zoneId: "z1", onlyServingZone: true }),
    );
    expect(zone.shops.map((s) => s.id)).toEqual(["a", "c"]);
    expect(zone.hiddenByZone).toBe(1);

    // Combined: the tagline search removes the one shop the category kept
    // on the other zone, so nothing is hidden any more.
    const both = filterShopsForDirectory(
      SHOPS,
      COUNTS,
      CATS,
      filters({ q: "panjabi", zoneId: "z1", onlyServingZone: true }),
    );
    expect(both.shops).toEqual([]);
    expect(both.hiddenByZone).toBe(1);
  });

  it("ignores the area toggle until a zone is picked", () => {
    const noZone = filterShopsForDirectory(
      SHOPS,
      COUNTS,
      CATS,
      filters({ onlyServingZone: true }),
    );
    expect(noZone.shops).toHaveLength(3);
    expect(noZone.hiddenByZone).toBe(0);
  });
});
