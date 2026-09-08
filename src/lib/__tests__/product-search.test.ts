import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { matchesProduct, shopSearchHref } from "@/lib/product-search";

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

  it("encodes special characters as query data, not navigation", () => {
    const href = shopSearchHref(" শার্ট & #new? ");
    const url = new URL(href, "https://prosanti.example");
    expect(url.pathname).toBe("/shop");
    expect(url.searchParams.get("q")).toBe("শার্ট & #new?");
    expect(url.hash).toBe("");
    expect(shopSearchHref("   ")).toBe("/shop");
  });
});
