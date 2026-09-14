import { describe, expect, it } from "vitest";
import { isStyleQueryEmpty, scoreProduct, styleMatch, STYLE_OCCASIONS } from "../style-match";
import type { Product } from "../catalog";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    slug: "heritage-green-panjabi",
    name: "Heritage Green Panjabi",
    category: "men",
    subCategory: "Panjabi",
    price: 149_000,
    colors: ["Forest Green"],
    sizes: ["M", "L", "XL"],
    inStock: true,
    featured: false,
    ...over,
  }) as Product;

describe("styleMatch — every point has a printed reason", () => {
  it("refuses to answer an empty query with the whole catalog", () => {
    expect(isStyleQueryEmpty({})).toBe(true);
    expect(styleMatch([product()], {})).toEqual([]);
  });

  it("filters out over-budget and unavailable pieces instead of ranking them low", () => {
    const cheap = product({ price: 99_000, id: "p0" });
    const costly = product({ price: 500_000, id: "p9" });
    const soldOut = product({ inStock: false, price: 10_000, id: "p7" });
    const out = styleMatch([costly, cheap, soldOut], { budgetTaka: 1500 });
    expect(out.map((m) => m.product.id)).toEqual(["p0"]);
    expect(out[0].reasons.some((r) => /budget/i.test(r))).toBe(true);
  });

  it("sizes are a hard gate — never suggest what the piece cannot ship", () => {
    const ok = product({ id: "a", sizes: ["L", "XL"] });
    const nope = product({ id: "b", sizes: ["S"] });
    const out = styleMatch([nope, ok], { size: "L" });
    expect(out.map((m) => m.product.id)).toEqual(["a"]);
    expect(out[0].reasons.some((r) => /your size/i.test(r))).toBe(true);
  });

  it("occasion maps to real subcategories and excludes the rest", () => {
    const eid = STYLE_OCCASIONS.find((o) => o.id === "eid")!;
    expect(eid.subcategories).toContain("panjabi");
    const panjabi = product({ id: "p1", subCategory: "Panjabi" });
    const tshirt = product({ id: "p2", subCategory: "T-Shirts", price: 59_000 });
    const out = styleMatch([tshirt, panjabi], { occasion: "eid" });
    expect(out.map((m) => m.product.id)).toEqual(["p1"]);
  });

  it("colours add, categories narrow, sales prove", () => {
    const out = styleMatch(
      [
        product({ id: "a", colors: ["Ivory"], unitsSold: 30 }),
        product({ id: "b", colors: ["Forest Green"], featured: true, unitsSold: 2 }),
      ],
      { colors: ["green"], categoryId: "men" },
    );
    // The design point: a colour-only query must not pad with unmatched
    // stock — "a" has no reason at all, so it is not offered. If it were
    // also on sale to the shopper's budget it would return with that reason.
    expect(out.map((m) => m.product.id)).toEqual(["b", "a"]); // green explains more
    expect(out[0].reasons.some((r) => /Forest Green/.test(r))).toBe(true);
    const both = styleMatch(
      [product({ id: "a", colors: ["Ivory"] }), product({ id: "b", colors: ["Forest Green"] })],
      { colors: ["green"], budgetTaka: 2000 },
    );
    expect(both.map((m) => m.product.id)).toEqual(["b", "a"]); // green first, both explained
  });

  it("caps results and keeps ties honest (price, then name)", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      product({ id: `p${i}`, price: 100_000 + i * 10_000 }),
    );
    const out = styleMatch(many, { budgetTaka: 2000 }, 4);
    expect(out).toHaveLength(4);
    // closer to the budget = better use of it (the rule printed in reasons),
    // so the top picks are the most ambitious prices that still fit.
    const prices = out.map((m) => m.product.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it("One Size queries accept free-size pieces and reject sized-only stock", () => {
    const free = product({ id: "g", sizes: ["One Size"] });
    const sized = product({ id: "s", sizes: ["M"] });
    expect(scoreProduct(free, { size: "One Size" })?.score).toBeGreaterThan(0);
    expect(scoreProduct(sized, { size: "One Size" })).toBeNull();
  });
});
