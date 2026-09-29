/**
 * C2 (2026-09-28) — the rules behind "one tap, one order per shop".
 *
 * The danger in splitting a basket is quiet multiplication: a discount that
 * was meant once appears twice, a weight is counted on every parcel, a shop's
 * own code pays for another shop's goods. Everything here exists to stop that,
 * and to keep each parcel honest about its own money.
 */
import { describe, expect, it } from "vitest";
import {
  BASKET_ITEM_WEIGHT_KG,
  MULTI_SHOP_MAX,
  couponAppliesTo,
  groupBasketByShop,
  isMultiShop,
  planCouponAcrossShops,
  primaryShopId,
  tooManyShops,
} from "@/lib/multi-shop";
import type { Coupon } from "@/lib/coupons";

const line = (productId: string, unitPrice: number, qty = 1) => ({
  productId,
  variantLabel: "L",
  qty,
  unitPrice,
});

const shopOf = (map: Record<string, string>) => (productId: string) => map[productId];

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c1",
  code: "EID10",
  type: "percent",
  value: 10,
  minOrder: 0,
  used: 0,
  active: true,
  ...over,
});

describe("groupBasketByShop", () => {
  it("keeps the shops in the order they were added", () => {
    const groups = groupBasketByShop(
      [line("a1", 1000), line("b1", 500), line("a2", 700, 2)],
      shopOf({ a1: "shop-a", a2: "shop-a", b1: "shop-b" }),
      "shop-a",
    );
    expect(groups.map((g) => g.shopId)).toEqual(["shop-a", "shop-b"]);
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].subtotal).toBe(1000 + 1400);
    expect(groups[0].qty).toBe(3); // units, not lines
  });

  it("weighs each parcel from its own units", () => {
    const groups = groupBasketByShop(
      [line("a1", 1000, 3), line("b1", 500, 1)],
      shopOf({ a1: "shop-a", b1: "shop-b" }),
      "shop-a",
    );
    expect(groups[0].weightKg).toBe(3 * BASKET_ITEM_WEIGHT_KG);
    expect(groups[1].weightKg).toBe(BASKET_ITEM_WEIGHT_KG);
  });

  it("falls back to the marketplace's own shop for a row with none", () => {
    const groups = groupBasketByShop([line("legacy", 900)], () => null, "shop-fallback");
    expect(groups[0].shopId).toBe("shop-fallback");
  });

  it("is empty for an empty bag", () => {
    expect(groupBasketByShop([], () => null, "")).toEqual([]);
    expect(isMultiShop([])).toBe(false);
  });
});

describe("primaryShopId — where the basket's single things go", () => {
  it("is the biggest parcel, because that is the only fair place for one tip", () => {
    const groups = groupBasketByShop(
      [line("a1", 300), line("b1", 900)],
      shopOf({ a1: "shop-a", b1: "shop-b" }),
      "shop-a",
    );
    expect(primaryShopId(groups)).toBe("shop-b");
  });

  it("breaks a tie with the parcel picked first", () => {
    const groups = groupBasketByShop(
      [line("a1", 500), line("b1", 500)],
      shopOf({ a1: "shop-a", b1: "shop-b" }),
      "shop-a",
    );
    expect(primaryShopId(groups)).toBe("shop-a");
  });
});

describe("tooManyShops", () => {
  it(`allows ${MULTI_SHOP_MAX} shops and refuses the next one`, () => {
    const build = (n: number) =>
      groupBasketByShop(
        Array.from({ length: n }, (_, i) => line(`p${i}`, 100)),
        (id) => `shop-${id}`,
        "shop-x",
      );
    expect(tooManyShops(build(MULTI_SHOP_MAX))).toBe(false);
    expect(tooManyShops(build(MULTI_SHOP_MAX + 1))).toBe(true);
  });
});

describe("planCouponAcrossShops", () => {
  const groups = groupBasketByShop(
    [line("a1", 100000), line("b1", 50000)],
    shopOf({ a1: "shop-a", b1: "shop-b" }),
    "shop-a",
  );

  it("lets a percent code ride every parcel — 10% of each is 10% of the basket", () => {
    const plan = planCouponAcrossShops({ coupon: coupon({ type: "percent", value: 10 }), groups });
    expect(plan.refused).toBeUndefined();
    expect(plan.entries.every((e) => e.apply)).toBe(true);
    expect(couponAppliesTo(plan, "shop-a")).toBe(true);
    expect(couponAppliesTo(plan, "shop-b")).toBe(true);
  });

  it("puts a FIXED amount on ONE parcel — twice would be a different code", () => {
    const plan = planCouponAcrossShops({
      coupon: coupon({ type: "fixed", value: 10000 }),
      groups,
    });
    expect(plan.refused).toBeUndefined();
    const applying = plan.entries.filter((e) => e.apply);
    expect(applying).toHaveLength(1);
    expect(applying[0].shopId).toBe("shop-a"); // the bigger parcel
    expect(plan.entries.find((e) => !e.apply)?.reason).toMatch(/once per basket/i);
  });

  it("waives delivery on every parcel for a free-delivery code", () => {
    const plan = planCouponAcrossShops({
      coupon: coupon({ type: "free_delivery", value: 0 }),
      groups,
    });
    expect(plan.freeDelivery).toBe(true);
    expect(plan.entries.every((e) => e.apply)).toBe(true);
  });

  it("keeps a SHOP's code on that shop's goods alone (B3)", () => {
    const plan = planCouponAcrossShops({
      coupon: coupon({ shopId: "shop-b" }),
      groups,
      shopName: "রঙধনু",
    });
    expect(plan.entries.find((e) => e.shopId === "shop-b")?.apply).toBe(true);
    expect(plan.entries.find((e) => e.shopId === "shop-a")?.apply).toBe(false);
  });

  it("refuses a shop's code when that shop is not in the bag", () => {
    const plan = planCouponAcrossShops({
      coupon: coupon({ shopId: "shop-z" }),
      groups,
      shopName: "মায়া",
    });
    expect(plan.refused).toMatch(/মায়া/);
  });

  it("refuses a code no parcel can meet, with the reason", () => {
    const plan = planCouponAcrossShops({
      coupon: coupon({ type: "percent", minOrder: 500000 }),
      groups,
    });
    expect(plan.refused).toBeTruthy();
    expect(plan.entries.every((e) => !e.apply)).toBe(true);
  });

  it("answers 'nothing' when no code was typed", () => {
    const plan = planCouponAcrossShops({ coupon: null, groups });
    expect(plan.entries.every((e) => !e.apply)).toBe(true);
    expect(plan.refused).toBeUndefined();
  });
});
