import { describe, expect, it } from "vitest";
import {
  codeTaken,
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  normalizeCode,
  upsertCoupon,
  type Coupon,
} from "../coupons";
import { seedCoupons } from "../coupons-store";
import { bdt } from "../format";

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c1",
  code: "WELCOME100",
  type: "fixed",
  value: bdt(100),
  minOrder: bdt(1000),
  used: 0,
  active: true,
  ...over,
});

const lines = [
  { productCategory: "men", subtotal: bdt(800) },
  { productCategory: "women", subtotal: bdt(1200) },
];

describe("coupons (§56)", () => {
  it("normalizes codes", () => {
    expect(normalizeCode("  welcome 100 ")).toBe("WELCOME100");
  });

  it("validates redeemability against active/min/usage/date", () => {
    const now = Date.now();
    expect(isCouponRedeemable(coupon(), bdt(1500)).ok).toBe(true);
    expect(isCouponRedeemable(coupon({ active: false }), bdt(5000)).ok).toBe(false);
    expect(isCouponRedeemable(coupon(), bdt(500)).ok).toBe(false);
    expect(isCouponRedeemable(coupon({ usageLimit: 3, used: 3 }), bdt(5000)).ok).toBe(false);
    expect(
      isCouponRedeemable(coupon({ validUntil: now - 1000 }), bdt(5000)).ok,
    ).toBe(false);
    expect(
      isCouponRedeemable(coupon({ validFrom: now + 5000 }), bdt(5000)).ok,
    ).toBe(false);
  });

  it("computes eligible subtotal for all vs one category", () => {
    const all = coupon();
    expect(eligibleSubtotal(all, lines)).toBe(bdt(2000));
    const men = coupon({ categoryId: "men" });
    expect(eligibleSubtotal(men, lines)).toBe(bdt(800));
  });

  it("caps discounts at the eligible amount and floors percent", () => {
    expect(discountAmount(coupon(), bdt(50))).toBe(bdt(50));
    expect(discountAmount(coupon(), bdt(5000))).toBe(bdt(100));
    expect(discountAmount(coupon({ type: "percent", value: 15 }), bdt(2000))).toBe(bdt(300));
    expect(discountAmount(coupon({ type: "percent", value: 15 }), 0)).toBe(0);
  });

  it("finds by normalized code and detects duplicates", () => {
    const list = seedCoupons();
    expect(findCoupon(list, " welcome100 ")?.id).toBe("c1");
    expect(findCoupon(list, "nope")).toBeUndefined();
    expect(codeTaken(list, "prosanti15")).toBe(true);
    expect(codeTaken(list, "prosanti15", "c2")).toBe(false); // itself excepted
  });

  it("upserts normalized codes and replaces by id", () => {
    const list = upsertCoupon([], coupon());
    expect(list[0].code).toBe("WELCOME100");
    const updated = upsertCoupon(list, { ...coupon(), used: 1 });
    expect(updated).toHaveLength(1);
    expect(updated[0].used).toBe(1);
  });
});
