import { describe, expect, it } from "vitest";
import {
  bestSellers,
  categoryLabel,
  categoryShelves,
  inStockFirst,
  moreInCategory,
  newArrivals,
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

describe("moreInCategory", () => {
  it("siblings first (never the piece itself or an excluded one), featured fill last", () => {
    const { items, sameCategory } = moreInCategory(ALL[0], ALL, [ALL[3]]);
    expect(items.map((p) => p.id)).toEqual(["m4", "m2", "w4"]); // m3 excluded, w4 = featured fill
    expect(sameCategory).toBe(2);
  });

  it("fill never includes sold-out or non-featured strangers", () => {
    const { items } = moreInCategory(prod("solo", "home"), ALL);
    expect(items.map((p) => p.id)).toEqual(["m4", "w4"]);
  });
});

describe("categoryLabel", () => {
  it("prefers the Bangla name when the UI is Bangla and one exists", () => {
    expect(categoryLabel(cat("men"), "bn")).toBe("men-bn");
    expect(categoryLabel(cat("men"), "en")).toBe("Men");
    expect(categoryLabel(cat("men", { nameBn: "" }), "bn")).toBe("Men");
  });
});
