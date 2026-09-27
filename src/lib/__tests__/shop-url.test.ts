/**
 * UX plan §3 (R4) — the listing's filter state ⇄ URL, pure.
 */
import { describe, expect, it } from "vitest";
import {
  PRICE_BAND_KEYS,
  inPriceBand,
  parseList,
  resolvePriceBand,
  shopSearchString,
  type ShopUrlState,
} from "@/lib/shop-url";

const base: ShopUrlState = {
  category: "all",
  sub: "",
  onlyNew: false,
  onlySale: false,
  q: "",
  mood: "",
  price: "any",
  sort: "featured",
  sizes: [],
  colors: [],
  inStock: false,
};

describe("shopSearchString", () => {
  it("is empty for the defaults and writes only what is set", () => {
    expect(shopSearchString(base)).toBe("");
    expect(
      shopSearchString({
        ...base,
        category: "men",
        sub: "Panjabi",
        onlySale: true,
        q: " kurta ",
        price: "under1000",
        sort: "price-asc",
        sizes: ["M", "L"],
        colors: ["Ivory"],
        inStock: true,
      }),
    ).toBe("?category=men&sub=Panjabi&filter=sale&q=kurta&price=under1000&sort=price-asc&size=M%2CL&color=Ivory&stock=1");
  });

  it("drops a sub-category without its category, prefers sale over new, keeps foreign params", () => {
    expect(shopSearchString({ ...base, sub: "Panjabi" })).toBe("");
    expect(shopSearchString({ ...base, onlyNew: true, onlySale: true })).toBe("?filter=sale");
    expect(shopSearchString({ ...base, onlyNew: true }, "?utm_source=fb&sort=best&size=M")).toBe(
      "?utm_source=fb&filter=new",
    );
  });
});

describe("parseList / resolvePriceBand / inPriceBand", () => {
  it("parses comma lists safely", () => {
    expect(parseList("M, L,M,,XL")).toEqual(["M", "L", "XL"]);
    expect(parseList(["S", "M"])).toEqual(["S", "M"]);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList(Array.from({ length: 20 }, (_, i) => `v${i}`).join(","))).toHaveLength(8);
    expect(parseList("x".repeat(100))[0]).toHaveLength(40);
  });

  it("knows the six bands and both bounds", () => {
    expect(PRICE_BAND_KEYS).toEqual(["any", "under500", "under1000", "1000-1500", "1500-2500", "above2500"]);
    expect(resolvePriceBand("under1000")).toBe("under1000");
    expect(resolvePriceBand(["1500-2500"])).toBe("1500-2500");
    expect(resolvePriceBand("cheap")).toBe("any");
    expect(inPriceBand(99_900, "1000-1500")).toBe(false);
    expect(inPriceBand(100_000, "1000-1500")).toBe(true);
    expect(inPriceBand(149_900, "1000-1500")).toBe(true);
    expect(inPriceBand(150_000, "1000-1500")).toBe(false);
    expect(inPriceBand(250_000, "above2500")).toBe(true);
    expect(inPriceBand(1, "any")).toBe(true);
  });
});
