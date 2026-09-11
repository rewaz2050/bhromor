import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product, type Shop } from "../catalog";
import {
  filterProductsForZone,
  isShopOrderable,
  lineShopIds,
  productShopId,
  shopById,
  shopServesZone,
  splitEta,
  toPublicShop,
} from "../shop-utils";

const shop = (over: Partial<Shop> = {}): Shop => ({
  id: "shop-1",
  slug: "shop-one",
  name: "Shop One",
  phone: "01700000000",
  zoneIds: ["dhanmondi"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 4.5,
  ratingCount: 10,
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  ...PRODUCTS[0],
  id: "p-x",
  ...over,
});

describe("toPublicShop", () => {
  it("strips the staff-only contact email", () => {
    const pub = toPublicShop(shop({ contactEmail: "owner@x.com" }));
    expect(pub.contactEmail).toBeUndefined();
    expect(pub.name).toBe("Shop One");
  });
});

describe("productShopId / shopById", () => {
  it("falls back to shop #1 for untagged launch-seed products", () => {
    expect(productShopId(product({ shopId: undefined }), "shop-1")).toBe(
      "shop-1",
    );
    expect(productShopId(product({ shopId: "shop-9" }), "shop-1")).toBe(
      "shop-9",
    );
  });

  it("resolves shops by id", () => {
    const shops = [shop({ id: "a" }), shop({ id: "b" })];
    expect(shopById(shops, "b")?.id).toBe("b");
    expect(shopById(shops, "zzz")).toBeUndefined();
  });
});

describe("isShopOrderable / shopServesZone", () => {
  it("requires active + open", () => {
    expect(isShopOrderable(shop())).toBe(true);
    expect(isShopOrderable(shop({ isOpen: false }))).toBe(false);
    expect(isShopOrderable(shop({ status: "suspended" }))).toBe(false);
    expect(isShopOrderable(shop({ status: "pending" }))).toBe(false);
  });

  it("matches the shop zone list", () => {
    expect(shopServesZone(shop(), "dhanmondi")).toBe(true);
    expect(shopServesZone(shop(), "uttara")).toBe(false);
  });
});

describe("filterProductsForZone", () => {
  const shops = [
    shop({ id: "open-dhan", zoneIds: ["dhanmondi"] }),
    shop({ id: "open-uttara", zoneIds: ["uttara"] }),
    shop({ id: "closed", zoneIds: ["dhanmondi"], isOpen: false }),
  ];
  const products = [
    product({ id: "p1", shopId: "open-dhan" }),
    product({ id: "p2", shopId: "open-uttara" }),
    product({ id: "p3", shopId: "closed" }),
    product({ id: "p4", shopId: "ghost" }),
  ];

  it("shows everything orderable without a zone", () => {
    expect(
      filterProductsForZone(products, shops, null, "open-dhan").map(
        (p) => p.id,
      ),
    ).toEqual(["p1", "p2"]);
  });

  it("scopes to the serving shops with a zone", () => {
    expect(
      filterProductsForZone(products, shops, "dhanmondi", "open-dhan").map(
        (p) => p.id,
      ),
    ).toEqual(["p1"]);
    expect(
      filterProductsForZone(products, shops, "uttara", "open-dhan").map(
        (p) => p.id,
      ),
    ).toEqual(["p2"]);
  });

  it("resolves untagged seeds through the fallback shop", () => {
    const untagged = [product({ id: "seed", shopId: undefined })];
    expect(
      filterProductsForZone(untagged, shops, "dhanmondi", "open-dhan").map(
        (p) => p.id,
      ),
    ).toEqual(["seed"]);
    expect(
      filterProductsForZone(untagged, shops, "uttara", "open-dhan"),
    ).toEqual([]);
  });
});

describe("lineShopIds", () => {
  it("dedupes the shops across cart lines", () => {
    expect(
      lineShopIds(
        [
          { product: product({ shopId: "a" }) },
          { product: product({ shopId: "a" }) },
          { product: product({ shopId: "b" }) },
          { product: product({ shopId: undefined }) },
        ],
        "a",
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("splitEta", () => {
  it("combines prep and delivery promises", () => {
    expect(splitEta(15, "45–60 min")).toBe(
      "Ready in ~15 min · at your door in 45–60 min",
    );
  });
});
