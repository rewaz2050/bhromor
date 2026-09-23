import { describe, expect, it } from "vitest";
import {
  bestSellers,
  categoryLabel,
  categoryShelves,
  inStockFirst,
  moreInCategory,
  newArrivals,
  offerCount,
  offerProducts,
} from "../home-shelves";
import type { Category, Product } from "../catalog";

const cat = (id: string, over: Partial<Category> = {}): Category => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  nameBn: `${id}-bn`,
  tagline: "",
  image: "/images/c.jpg",
  subCategories: [],
  ...over,
});

const prod = (id: string, category: string, over: Partial<Product> = {}): Product =>
  ({
    id,
    slug: id,
    sku: id.toUpperCase(),
    name: `Piece ${id}`,
    category,
    subCategory: "",
    price: 100000,
    shortDescription: "",
    description: [],
    details: [],
    colors: [],
    sizes: [],
    featured: false,
    isNew: false,
    inStock: true,
    media: [{ src: "/images/p.jpg", alt: "" }],
    rating: 0,
    reviewCount: 0,
    ...over,
  }) as Product;

const CATS = [cat("men"), cat("women"), cat("kids", { active: false }), cat("home")];
// Catalog order = newest first (as the live read returns it).
const ALL = [
  prod("m1", "men", { isNew: true, unitsSold: 3 }),
  prod("m2", "men", { inStock: false, unitsSold: 40 }),
  prod("w1", "women", { unitsSold: 12 }),
  prod("m3", "men", { unitsSold: 12 }),
  prod("k1", "kids"),
  prod("w2", "women", { status: "draft" }),
  prod("w3", "women", { active: false }),
  prod("m4", "men", { featured: true }),
  prod("w4", "women", { featured: true, isNew: true }),
];

describe("categoryShelves", () => {
  it("one block per active category with pieces, in category order, in-stock first", () => {
    const shelves = categoryShelves(ALL, CATS);
    expect(shelves.map((s) => s.category.id)).toEqual(["men", "women"]); // kids inactive, home empty
    expect(shelves[0].products.map((p) => p.id)).toEqual(["m1", "m3", "m4", "m2"]);
    expect(shelves[1].products.map((p) => p.id)).toEqual(["w1", "w4"]); // draft + archived hidden
    expect(shelves[0].href).toBe("/shop?category=men");
    expect(shelves[0].hiddenCount).toBe(0);
  });

  it("caps each block and counts the remainder for the See-all button", () => {
    const shelves = categoryShelves(ALL, CATS, 2);
    expect(shelves[0].products.map((p) => p.id)).toEqual(["m1", "m3"]);
    expect(shelves[0].hiddenCount).toBe(2);
    expect(categoryShelves(ALL, CATS, 0)[0].products).toHaveLength(4); // 0 = no cap
  });

  it("inStockFirst keeps relative order inside each half", () => {
    expect(inStockFirst([ALL[1], ALL[0], ALL[3]]).map((p) => p.id)).toEqual(["m1", "m3", "m2"]);
  });
});

describe("bestSellers", () => {
  it("ranks by real units sold, in stock only, ties keep catalog order", () => {
    expect(bestSellers(ALL).map((p) => p.id)).toEqual(["w1", "m3", "m1"]); // m2 sold out
  });

  it("stays empty until the shop has at least `min` real sellers", () => {
    const one = [prod("a", "men", { unitsSold: 5 }), prod("b", "men")];
    expect(bestSellers(one)).toEqual([]);
    expect(bestSellers(one, 8, 1).map((p) => p.id)).toEqual(["a"]);
    expect(bestSellers([prod("z", "men")])).toEqual([]);
  });
});

describe("newArrivals", () => {
  it("flagged new first, then newest catalog order; in stock, discoverable only", () => {
    expect(newArrivals(ALL, 4).map((p) => p.id)).toEqual(["m1", "w4", "w1", "m3"]);
  });
});

describe("offerProducts", () => {
  const SALE = [
    prod("a", "men", { price: 100000, compareAtPrice: 120000 }), // 17% off
    prod("b", "men", { price: 100000, compareAtPrice: 200000, inStock: false }), // 50% off, sold out
    prod("c", "women", { price: 100000, compareAtPrice: 150000 }), // 33% off
    prod("d", "women", { price: 100000, compareAtPrice: 100000 }), // not a reduction
    prod("e", "women", { price: 100000 }), // no compare-at
    prod("f", "men", { price: 100000, compareAtPrice: 150000, status: "draft" }), // hidden
    prod("g", "men", { price: 100000, compareAtPrice: 150000 }), // 33% off, ties keep catalog order
  ];

  it("keeps only real reductions, biggest saving first, sold-out last", () => {
    expect(offerProducts(SALE).map((p) => p.id)).toEqual(["c", "g", "a", "b"]);
    expect(offerCount(SALE)).toBe(4);
  });

  it("caps the rail and treats 0 as no cap", () => {
    expect(offerProducts(SALE, 2).map((p) => p.id)).toEqual(["c", "g"]);
    expect(offerProducts(SALE, 0)).toHaveLength(4);
    expect(offerProducts(ALL)).toEqual([]); // nothing marked down → empty, never fake
  });
});

describe("moreInCategory", () => {
  it("siblings from the SAME category only — never the piece itself, an excluded one, or a stranger", () => {
    const { items, hiddenCount, total } = moreInCategory(ALL[0], ALL, [ALL[3]]);
    expect(items.map((p) => p.id)).toEqual(["m4", "m2"]); // m3 excluded; w4 (featured) is NOT pulled in
    expect(hiddenCount).toBe(0);
    expect(total).toBe(4); // m1, m2, m3, m4 — what /shop?category=men lists
  });

  it("stays empty when the category has no other piece (no fill from elsewhere)", () => {
    const { items, hiddenCount, total } = moreInCategory(prod("solo", "home"), ALL);
    expect(items).toEqual([]);
    expect(hiddenCount).toBe(0);
    expect(total).toBe(0);
  });

  it("caps the row and counts the siblings left behind for the See-all link", () => {
    const { items, hiddenCount, total } = moreInCategory(ALL[0], ALL, [], 2);
    expect(items.map((p) => p.id)).toEqual(["m3", "m4"]); // in stock first, m2 (sold out) waits
    expect(hiddenCount).toBe(1);
    expect(total).toBe(4);
  });
});

describe("categoryLabel", () => {
  it("prefers the Bangla name when the UI is Bangla and one exists", () => {
    expect(categoryLabel(cat("men"), "bn")).toBe("men-bn");
    expect(categoryLabel(cat("men"), "en")).toBe("Men");
    expect(categoryLabel(cat("men", { nameBn: "" }), "bn")).toBe("Men");
  });
});
