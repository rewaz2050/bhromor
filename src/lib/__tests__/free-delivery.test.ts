import { describe, expect, it } from "vitest";
import {
  FREE_DELIVERY_DEFAULTS,
  FREE_DELIVERY_MAX_PAISA,
  FREE_DELIVERY_MIN_PAISA,
  freeDeliveryFor,
  freeDeliveryOffers,
  freeDeliveryProgress,
  freeDeliveryTarget,
  parseShopFreeDeliveryMin,
  sanitizeFreeDelivery,
} from "../free-delivery";
import { sanitizeSettings, SETTINGS_DEFAULTS } from "../settings-store";
import { deliveryBreakdown } from "../delivery";
import { DELIVERY_ZONES } from "../catalog";

const platform = (min = 99_900) => ({ enabled: true, minSubtotalPaisa: min });

describe("free delivery — platform rule sanitizer", () => {
  it("is OFF by default at ৳999 — nothing is promised until the owner arms it", () => {
    expect(FREE_DELIVERY_DEFAULTS).toEqual({ enabled: false, minSubtotalPaisa: 99_900 });
    expect(sanitizeFreeDelivery(undefined)).toEqual(FREE_DELIVERY_DEFAULTS);
    expect(sanitizeFreeDelivery({ enabled: "yes" })).toEqual(FREE_DELIVERY_DEFAULTS);
  });

  it("clamps the minimum into ৳100 … ৳50,000 and keeps a real boolean", () => {
    expect(sanitizeFreeDelivery({ enabled: true, minSubtotalPaisa: 5 })).toEqual({
      enabled: true,
      minSubtotalPaisa: FREE_DELIVERY_MIN_PAISA,
    });
    expect(sanitizeFreeDelivery({ enabled: true, minSubtotalPaisa: 1e12 }).minSubtotalPaisa).toBe(
      FREE_DELIVERY_MAX_PAISA,
    );
    expect(sanitizeFreeDelivery({ enabled: true, minSubtotalPaisa: 149_950.7 }).minSubtotalPaisa).toBe(
      149_950,
    );
  });

  it("rides along in the ops settings document (public /api/settings shape)", () => {
    expect(SETTINGS_DEFAULTS.freeDelivery).toEqual(FREE_DELIVERY_DEFAULTS);
    const s = sanitizeSettings({ freeDelivery: { enabled: true, minSubtotalPaisa: 79_900 } });
    expect(s.freeDelivery).toEqual({ enabled: true, minSubtotalPaisa: 79_900 });
    // and a legacy document without the key still sanitizes to OFF
    expect(sanitizeSettings({ lowStockThreshold: 3 }).freeDelivery.enabled).toBe(false);
  });
});

describe("free delivery — shop minimum parser", () => {
  it("null / empty / zero / garbage mean 'no shop rule'", () => {
    for (const raw of [null, undefined, "", 0, -5, "abc", false, Number.NaN]) {
      expect(parseShopFreeDeliveryMin(raw)).toBeNull();
    }
  });
  it("accepts paisa as number or numeric string and clamps into range", () => {
    expect(parseShopFreeDeliveryMin(99_900)).toBe(99_900);
    expect(parseShopFreeDeliveryMin("149900")).toBe(149_900);
    expect(parseShopFreeDeliveryMin(1)).toBe(FREE_DELIVERY_MIN_PAISA);
    expect(parseShopFreeDeliveryMin(9e9)).toBe(FREE_DELIVERY_MAX_PAISA);
  });
});

describe("free delivery — offers, target, who pays", () => {
  it("lists armed rules platform-first and ignores disabled / empty ones", () => {
    expect(freeDeliveryOffers(undefined, undefined)).toEqual([]);
    expect(freeDeliveryOffers({ enabled: false, minSubtotalPaisa: 50_000 }, { freeDeliveryMinPaisa: null })).toEqual([]);
    expect(freeDeliveryOffers(platform(), { freeDeliveryMinPaisa: 79_900 })).toEqual([
      { by: "platform", minSubtotalPaisa: 99_900 },
      { by: "shop", minSubtotalPaisa: 79_900 },
    ]);
    expect(freeDeliveryOffers(undefined, { freeDeliveryMinPaisa: 79_900 })).toEqual([
      { by: "shop", minSubtotalPaisa: 79_900 },
    ]);
  });

  it("the shopper aims for the LOWEST armed minimum", () => {
    expect(freeDeliveryTarget([])).toBeNull();
    expect(freeDeliveryTarget(freeDeliveryOffers(platform(99_900), { freeDeliveryMinPaisa: 79_900 }))).toBe(79_900);
    expect(freeDeliveryTarget(freeDeliveryOffers(platform(49_900), { freeDeliveryMinPaisa: 79_900 }))).toBe(49_900);
  });

  it("who pays: platform first, then the shop — each only above its own minimum", () => {
    const offers = freeDeliveryOffers(platform(99_900), { freeDeliveryMinPaisa: 79_900 });
    expect(freeDeliveryFor(50_000, offers)).toBeNull();
    // between the two minimums: only the shop's rule is met → the shop pays
    expect(freeDeliveryFor(80_000, offers)?.by).toBe("shop");
    // above both: PROSANTI pays, the shop's payout is untouched
    expect(freeDeliveryFor(120_000, offers)?.by).toBe("platform");
    expect(freeDeliveryFor(99_900, offers)?.by).toBe("platform"); // inclusive
  });

  it("never on the courier leg, on pickup, or on top of a coupon / PROSANTI+", () => {
    const offers = freeDeliveryOffers(platform(), undefined);
    expect(freeDeliveryFor(200_000, offers, { courier: true })).toBeNull();
    expect(freeDeliveryFor(200_000, offers, { pickup: true })).toBeNull();
    expect(freeDeliveryFor(200_000, offers, { alreadyFree: true })).toBeNull();
    expect(freeDeliveryProgress(200_000, offers, { courier: true })).toBeNull();
    expect(freeDeliveryFor(0, offers)).toBeNull();
  });

  it("progress: remaining, reached and a 0–100 bar", () => {
    const offers = freeDeliveryOffers(platform(100_000), undefined);
    expect(freeDeliveryProgress(25_000, offers)).toEqual({
      target: 100_000,
      remaining: 75_000,
      reached: false,
      pct: 25,
    });
    expect(freeDeliveryProgress(100_000, offers)).toEqual({
      target: 100_000,
      remaining: 0,
      reached: true,
      pct: 100,
    });
    expect(freeDeliveryProgress(999_999, offers)?.pct).toBe(100);
    expect(freeDeliveryProgress(10_000, [])).toBeNull();
  });
});

describe("free delivery — deliveryBreakdown mirror", () => {
  const z1 = DELIVERY_ZONES.find((z) => z.id === "z1")!;
  const z4 = DELIVERY_ZONES.find((z) => z.id === "z4")!;

  it("a threshold waiver zeroes the base charge AND every surcharge, and names the payer", () => {
    const b = deliveryBreakdown({
      zone: z1,
      subtotal: 150_000,
      isNight: true,
      isRain: true,
      isExpress: true,
      weightKg: 9,
      thresholdFree: "shop",
    });
    expect(b.freeDelivery).toBe(true);
    expect(b.thresholdFree).toBe("shop");
    expect(b.totalCharge).toBe(0);
    expect(b.surcharge.total).toBe(0);
    expect(b.baseCharge).toBe(z1.charge); // still shown struck through
  });

  it("does not apply on the courier zone or when a coupon / PROSANTI+ already paid", () => {
    const courier = deliveryBreakdown({ zone: z4, subtotal: 150_000, thresholdFree: "platform" });
    expect(courier.thresholdFree).toBeNull();
    expect(courier.freeDelivery).toBe(false);
    expect(courier.totalCharge).toBe(z4.charge);
    const coupon = deliveryBreakdown({ zone: z1, subtotal: 150_000, couponFree: true, thresholdFree: "platform" });
    expect(coupon.thresholdFree).toBeNull();
    expect(coupon.couponFree).toBe(true);
    expect(coupon.totalCharge).toBe(0);
    const pickup = deliveryBreakdown({ zone: z1, subtotal: 150_000, isPickup: true, thresholdFree: "platform" });
    expect(pickup.thresholdFree).toBeNull();
    expect(pickup.totalCharge).toBe(0);
  });

  it("without a threshold nothing changes — ৳60 city charge as before", () => {
    const b = deliveryBreakdown({ zone: z1, subtotal: 150_000 });
    expect(b.thresholdFree).toBeNull();
    expect(b.totalCharge).toBe(z1.charge);
  });
});
