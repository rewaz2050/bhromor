import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { expandSearchTerm, foldSearchText, matchesProduct, shopSearchHref } from "@/lib/product-search";

describe("product search", () => {
  it("matches names, Bengali names, SKUs and categories regardless of case or whitespace", () => {
    const product = PRODUCTS[0];
    for (const value of [
      product.name,
      product.sku,
      product.subCategory,
      product.category,
      product.nameBn!,
    ]) {
      expect(matchesProduct(product, `  ${value.toUpperCase()}  `)).toBe(true);
    }
    expect(matchesProduct(product, "no-such-product")).toBe(false);
    expect(matchesProduct(product, "  ")).toBe(true);
  });

  it("normalizes equivalent Unicode spelling", () => {
    expect(
      matchesProduct({ ...PRODUCTS[0], name: "Café cotton" }, "cafe\u0301"),
    ).toBe(true);
  });

  /* UX plan §1.2 — spelling tolerance across scripts */
  const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
  const threePiece = PRODUCTS.find((p) => p.subCategory === "Three-Piece")!;
  const tshirt = PRODUCTS.find((p) => p.subCategory === "T-Shirts")!;

  it("finds an English-named product from its Bengali name in either spelling", () => {
    expect(matchesProduct(panjabi, "পাঞ্জাবি")).toBe(true);
    expect(matchesProduct(panjabi, "পাঞ্জাবী")).toBe(true); // dirgho-i
    expect(matchesProduct(panjabi, "punjabi")).toBe(true);
    expect(matchesProduct(threePiece, "থ্রিপিস")).toBe(true);
    expect(matchesProduct(threePiece, "সালোয়ার কামিজ")).toBe(true);
    expect(matchesProduct(threePiece, "3 piece")).toBe(true);
    expect(matchesProduct(tshirt, "t shirt")).toBe(true);
    expect(matchesProduct(tshirt, "টিশার্ট")).toBe(true);
    expect(matchesProduct(tshirt, "পাঞ্জাবি")).toBe(false);
  });

  it("matches every word of a multi-word query in any order", () => {
    expect(matchesProduct(panjabi, "green panjabi")).toBe(matchesProduct(panjabi, "panjabi green"));
    expect(matchesProduct(panjabi, "panjabi zzzz")).toBe(false);
  });

  it("folds the spellings people actually type", () => {
    expect(foldSearchText("শাড়ী")).toBe(foldSearchText("শাড়ি"));
    expect(foldSearchText("সার্ট")).toBe(foldSearchText("শার্ট"));
    expect(foldSearchText("T-Shirt")).toBe("tshirt");
    expect(foldSearchText("Café")).toBe("cafe");
    expect(expandSearchTerm("লুঙ্গি")).toContain("lungi");
    expect(expandSearchTerm("nothing")).toEqual(["nothing"]);
    expect(expandSearchTerm(" - ")).toEqual([]);
  });

  it("encodes special characters as query data, not navigation", () => {
    const href = shopSearchHref(" শার্ট & #new? ");
    const url = new URL(href, "https://prosanti.example");
    expect(url.pathname).toBe("/shop");
    expect(url.searchParams.get("q")).toBe("শার্ট & #new?");
    expect(url.hash).toBe("");
    expect(shopSearchHref("   ")).toBe("/shop");
  });
});
