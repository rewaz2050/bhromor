/**
 * Where a piece lives (C5) — `/shops/<shop>/p/<piece>`.
 *
 * The rules that matter: a link is only put inside a shop when the row says
 * which shop, and the old address still works for everything else.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../catalog";
import {
  isProductHref,
  legacyProductPath,
  productHref,
  productPath,
} from "../product-url";

const SHOP = { id: "shop-1", slug: "prosanti-direct" };
const OTHER = { id: "shop-2", slug: "second-shop" };
const PIECE = { id: "p1", slug: "cotton-panjabi", shopId: "shop-1" };

describe("productPath", () => {
  it("addresses a piece inside its shop", () => {
    expect(productPath("prosanti-direct", "cotton-panjabi")).toBe(
      "/shops/prosanti-direct/p/cotton-panjabi",
    );
  });

  it("keeps the old address for links that cannot name a shop", () => {
    expect(legacyProductPath("cotton-panjabi")).toBe("/product/cotton-panjabi");
  });

  it("escapes a name that would break the path", () => {
    expect(productPath("prosanti direct", "cotton panjabi")).toBe(
      "/shops/prosanti%20direct/p/cotton%20panjabi",
    );
  });
});

describe("productHref", () => {
  it("puts the piece inside the shop that sells it", () => {
    expect(productHref(PIECE, [SHOP, OTHER])).toBe(
      "/shops/prosanti-direct/p/cotton-panjabi",
    );
  });

  it("never guesses the shop — an unknown shopId falls back to the old address", () => {
    // A live row from a vendor we cannot place would 404 under a guessed
    // shop, and the old address still redirects to the right one.
    expect(productHref({ slug: "cotton-panjabi" }, [SHOP, OTHER])).toBe(
      "/product/cotton-panjabi",
    );
    expect(productHref({ slug: "cotton-panjabi", shopId: "shop-9" }, [SHOP])).toBe(
      "/product/cotton-panjabi",
    );
  });

  it("falls back to the old address when no shops are loaded yet", () => {
    expect(productHref(PIECE, [])).toBe("/product/cotton-panjabi");
  });

  it("gives two shops the same name two different addresses", () => {
    const inA = productHref({ slug: "p", shopId: "shop-1" }, [SHOP, OTHER]);
    const inB = productHref({ slug: "p", shopId: "shop-2" }, [SHOP, OTHER]);
    expect(inA).not.toBe(inB);
    expect([inA, inB]).toEqual(["/shops/prosanti-direct/p/p", "/shops/second-shop/p/p"]);
  });

  it("links a seeded row (no shopId) through the address that always answers", () => {
    const seed = PRODUCTS[0]!;
    expect(seed.shopId).toBeUndefined();
    expect(productHref(seed, [SHOP])).toBe(`/product/${seed.slug}`);
  });
});

describe("isProductHref", () => {
  it("recognises both spellings", () => {
    expect(isProductHref("/product/cotton-panjabi")).toBe(true);
    expect(isProductHref("/shops/prosanti-direct/p/cotton-panjabi")).toBe(true);
  });

  it("does not mistake a shop page or the browse page for a piece", () => {
    expect(isProductHref("/shops/prosanti-direct")).toBe(false);
    expect(isProductHref("/shop?category=men")).toBe(false);
  });
});
