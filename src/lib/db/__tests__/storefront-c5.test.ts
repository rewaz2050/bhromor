/** C5 — a piece lookup carries both shop and piece slug. */
import { describe, expect, it, vi } from "vitest";
import { PRODUCTS, type Product, type Shop } from "../../catalog";

vi.mock("server-only", () => ({}));

import {
  findShopProduct,
  findStorefrontProductsBySlug,
  findStorefrontShop,
} from "../storefront";

const shop = (id: string, slug: string): Shop => ({
  id,
  slug,
  name: slug,
  phone: "01700000000",
  zoneIds: [],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

const piece = (id: string, shopId: string | undefined, slug = "cotton-panjabi"): Product => ({
  ...PRODUCTS[0]!,
  id,
  shopId,
  slug,
  name: "Cotton Panjabi",
});

const shops = [shop("a", "first-shop"), shop("b", "second-shop")];
const products = [piece("p1", "a"), piece("p2", "b")];

describe("C5 storefront product lookup", () => {
  it("finds the requested shop by URL slug", () => {
    expect(findStorefrontShop(shops, "second-shop")?.id).toBe("b");
    expect(findStorefrontShop(shops, "missing")).toBeUndefined();
  });

  it("disambiguates identical product slugs by shop", () => {
    expect(findShopProduct(products, shops, "first-shop", "cotton-panjabi")?.id).toBe("p1");
    expect(findShopProduct(products, shops, "second-shop", "cotton-panjabi")?.id).toBe("p2");
  });

  it("returns 404-worthy undefined for a wrong shop or wrong product", () => {
    expect(findShopProduct(products, shops, "missing", "cotton-panjabi")).toBeUndefined();
    expect(findShopProduct(products, shops, "first-shop", "missing")).toBeUndefined();
  });

  it("sends every old name match to the legacy-address chooser", () => {
    expect(findStorefrontProductsBySlug(products, "cotton-panjabi").map((p) => p.id)).toEqual([
      "p1",
      "p2",
    ]);
    expect(findStorefrontProductsBySlug(products, "missing")).toEqual([]);
  });

  it("still assigns pre-marketplace rows without a shopId to the fallback shop", () => {
    const seed = piece("legacy", undefined);
    const withoutShop = { ...seed, shopId: undefined };
    expect(findShopProduct([withoutShop], shops, "first-shop", "cotton-panjabi")?.id).toBe(
      "legacy",
    );
    expect(findShopProduct([withoutShop], shops, "second-shop", "cotton-panjabi")).toBeUndefined();
  });
});
