import { describe, expect, it } from "vitest";
import {
  bestCoupon,
  codeTaken,
  discountAmount,
  eligibleSubtotal,
  findCoupon,
  isCouponRedeemable,
  normalizeCode,
  upsertCoupon,
  type Coupon,
} from "../coupons";
import { launchCoupons } from "./coupon-fixtures";
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
    // zone restriction
    expect(isCouponRedeemable(coupon({ zoneId: "z1" }), bdt(5000), "z1").ok).toBe(true);
    expect(isCouponRedeemable(coupon({ zoneId: "z1" }), bdt(5000), "z2").ok).toBe(false);
    expect(isCouponRedeemable(coupon({ zoneId: "z1" }), bdt(5000)).ok).toBe(false);
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
    // maxDiscount cap
    expect(discountAmount(coupon({ type: "percent", value: 20, maxDiscount: bdt(300) }), bdt(5000))).toBe(bdt(300));
    // free_delivery gives 0 discount (waives delivery separately)
    expect(discountAmount(coupon({ type: "free_delivery", value: 0 }), bdt(5000))).toBe(0);
  });

  it("finds by normalized code and detects duplicates", () => {
    const list = launchCoupons();
    expect(findCoupon(list, " welcome100 ")?.id).toBe("c1");
    expect(findCoupon(list, "nope")).toBeUndefined();
    expect(codeTaken(list, "sunamganj15")).toBe(true);
    expect(codeTaken(list, "sunamganj15", "c2")).toBe(false); // itself excepted
    expect(codeTaken(list, "freedelivery")).toBe(true);
  });

  it("upserts normalized codes and replaces by id", () => {
    const list = upsertCoupon([], coupon());
    expect(list[0].code).toBe("WELCOME100");
    const updated = upsertCoupon(list, { ...coupon(), used: 1 });
    expect(updated).toHaveLength(1);
    expect(updated[0].used).toBe(1);
  });
});

describe("bestCoupon — auto-apply best offer", () => {
  it("returns null when nothing applies", () => {
    expect(bestCoupon([], lines, bdt(500), "z1")).toBeNull();
    // WELCOME100 needs ৳1,000 — a ৳500 cart doesn't qualify.
    expect(bestCoupon([coupon()], lines, bdt(500), "z1")).toBeNull();
  });

  it("picks the biggest discount for the cart", () => {
    const list = [
      coupon(), // fixed ৳100
      coupon({ id: "c2", code: "BIG20", type: "percent", value: 20, minOrder: 0 }),
    ];
    const best = bestCoupon(list, lines, bdt(2000), "z1");
    expect(best?.code).toBe("BIG20");
    expect(best?.discount).toBe(bdt(400));
    expect(best?.freeDelivery).toBe(false);
    expect(best?.savings).toBe(bdt(400));
  });

  it("values a free-delivery coupon at the flat ৳60 charge", () => {
    const freeDelivery = coupon({
      id: "c3",
      code: "RIDEFREE",
      type: "free_delivery",
      value: 0,
      minOrder: 0,
    });
    const best = bestCoupon([freeDelivery], lines, bdt(500), "z1");
    expect(best?.code).toBe("RIDEFREE");
    expect(best?.freeDelivery).toBe(true);
    expect(best?.discount).toBe(0);
    expect(best?.savings).toBe(bdt(60));
  });

  it("prefers a ৳100 discount over a ৳60 free-delivery coupon", () => {
    const freeDelivery = coupon({
      id: "c3",
      code: "RIDEFREE",
      type: "free_delivery",
      value: 0,
      minOrder: 0,
    });
    const list = [freeDelivery, coupon({ minOrder: 0 })];
    const best = bestCoupon(list, lines, bdt(2000), "z1");
    expect(best?.code).toBe("WELCOME100");
    expect(best?.savings).toBe(bdt(100));
  });

  it("respects zone restrictions", () => {
    const zoned = coupon({ id: "c4", code: "Z1ONLY", zoneId: "z1", minOrder: 0 });
    expect(bestCoupon([zoned], lines, bdt(2000), "z2")).toBeNull();
    expect(bestCoupon([zoned], lines, bdt(2000), "z1")?.code).toBe("Z1ONLY");
  });
});
