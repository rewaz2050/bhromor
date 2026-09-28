/**
 * B3 (2026-09-28) — promo caps and promo arithmetic.
 *
 * Two rules worth pinning, because both are money:
 *   • the platform's caps are the ceiling — a shop cannot promise 60% or a
 *     code that never ends, and the refusal names the cap;
 *   • the discount comes out of the SHOP's share, so the break-even number
 *     ("how much more must I sell just to stand still") is shown, not hidden.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMO_LIMITS,
  PROMO_STATE_LABEL,
  promoLimitsFrom,
  promoRemaining,
  promoShareMath,
  promoShareSummary,
  promoState,
  validateVendorPromo,
} from "@/lib/vendor-promo";

const limits = DEFAULT_PROMO_LIMITS;

describe("validateVendorPromo", () => {
  it("accepts a normal percent code and normalizes it", () => {
    const checked = validateVendorPromo(
      { code: " eid10 ", type: "percent", value: "10", days: "14", usageLimit: "50" },
      limits,
    );
    expect(checked.ok).toBe(true);
    expect(checked.value).toEqual({
      code: "EID10",
      type: "percent",
      value: 10,
      minOrder: 0,
      maxDiscount: null,
      days: 14,
      usageLimit: 50,
      description: "",
    });
  });

  it("reads taka from the form and stores paisa", () => {
    const checked = validateVendorPromo(
      { code: "FLAT50", type: "fixed", value: "50", minOrder: "1200", days: 7, usageLimit: 20 },
      limits,
    );
    expect(checked.ok).toBe(true);
    expect(checked.value.value).toBe(5000);
    expect(checked.value.minOrder).toBe(120_000);
  });

  it("refuses anything past the platform caps, naming the cap", () => {
    const percent = validateVendorPromo(
      { code: "BIG", type: "percent", value: 60, days: 5, usageLimit: 10 },
      limits,
    );
    expect(percent.ok).toBe(false);
    expect(percent.errors.value).toContain(`${limits.maxPercent}%`);

    const long = validateVendorPromo(
      { code: "LONG", type: "percent", value: 5, days: 90, usageLimit: 10 },
      limits,
    );
    expect(long.errors.days).toContain(`${limits.maxDays} days`);

    const many = validateVendorPromo(
      { code: "MANY", type: "percent", value: 5, days: 5, usageLimit: 5000 },
      limits,
    );
    expect(many.errors.usageLimit).toContain(`${limits.maxUsage}`);

    const bigFixed = validateVendorPromo(
      { code: "HUGE", type: "fixed", value: "900", days: 5, usageLimit: 10 },
      limits,
    );
    expect(bigFixed.errors.value).toContain("৳500");
  });

  it("refuses a bad code, a ৳0 fixed discount and a cap on a fixed code", () => {
    // Spaces are simply removed ("no spaces here" → NOSPACESHERE, a real code);
    // a too-short or non-alphanumeric one is refused outright.
    expect(validateVendorPromo({ code: "no spaces here", days: 5, usageLimit: 5 }, limits).value.code).toBe(
      "NOSPACESHERE",
    );
    expect(validateVendorPromo({ code: "ab", days: 5, usageLimit: 5 }, limits).errors.code).toBeTruthy();
    expect(validateVendorPromo({ code: "EID-10%", days: 5, usageLimit: 5 }, limits).errors.code).toBeTruthy();
    expect(
      validateVendorPromo({ code: "ZERO", type: "fixed", value: "0", days: 5, usageLimit: 5 }, limits)
        .errors.value,
    ).toContain("৳1");
    expect(
      validateVendorPromo(
        { code: "CAPFIX", type: "fixed", value: "50", maxDiscount: "200", days: 5, usageLimit: 5 },
        limits,
      ).errors.maxDiscount,
    ).toContain("percent");
  });

  it("tolerates junk input without throwing", () => {
    for (const raw of [null, undefined, 7, "x", []]) {
      const checked = validateVendorPromo(raw, limits);
      expect(checked.ok).toBe(false);
      expect(checked.value.code).toBe("");
    }
  });

  it("uses the platform's numbers when the limits table is unreadable", () => {
    expect(promoLimitsFrom(null)).toEqual(DEFAULT_PROMO_LIMITS);
    expect(promoLimitsFrom({ max_percent: 0, max_days: -3 })).toEqual(DEFAULT_PROMO_LIMITS);
    expect(
      promoLimitsFrom({ max_percent: 40, max_discount: 90000, max_days: 60, max_usage: 900, max_active: 5 }),
    ).toEqual({ maxPercent: 40, maxDiscount: 90000, maxDays: 60, maxUsage: 900, maxActive: 5 });
  });
});

describe("promoShareMath", () => {
  it("prices a 10% code on a ৳1,200 order against a 15% commission", () => {
    const math = promoShareMath({ type: "percent", value: 10, maxDiscount: null }, { commissionPct: 15 });
    expect(math.subtotal).toBe(120_000);
    expect(math.commission).toBe(18_000);
    expect(math.vendorWithout).toBe(102_000);
    expect(math.discount).toBe(12_000);
    expect(math.vendorWith).toBe(90_000);
    // 12000 / 90000 → 13.3% more orders just to stand still.
    expect(math.breakEvenUpliftPct).toBe(13.3);
  });

  it("respects the per-order cap and never discounts more than the shop earns", () => {
    const capped = promoShareMath(
      { type: "percent", value: 25, maxDiscount: 5_000 },
      { commissionPct: 15 },
    );
    expect(capped.discount).toBe(5_000);

    // A fixed ৳900 code on a small order: the shop's share is the ceiling.
    const huge = promoShareMath({ type: "fixed", value: 100_000, maxDiscount: null }, {
      subtotal: 50_000,
      commissionPct: 15,
    });
    expect(huge.vendorWith).toBe(0);
    expect(huge.discount).toBe(42_500);
  });

  it("reads like a sentence a shop can act on", () => {
    const math = promoShareMath({ type: "percent", value: 10, maxDiscount: null }, { commissionPct: 15 });
    const line = promoShareSummary(math);
    expect(line).toContain("৳1,200");
    expect(line).toContain("৳900");
    expect(line).toContain("13.3%");
  });
});

describe("promo state", () => {
  const NOW = Date.parse("2026-09-28T12:00:00Z");

  it("tells live, scheduled, paused, used-up and ended apart", () => {
    expect(promoState({ active: true, used: 0, validUntil: NOW + 1000 }, NOW)).toBe("live");
    expect(promoState({ active: true, used: 0, validFrom: NOW + 5000 }, NOW)).toBe("scheduled");
    expect(promoState({ active: false, used: 0, validUntil: NOW + 1000 }, NOW)).toBe("paused");
    expect(promoState({ active: true, used: 50, usageLimit: 50, validUntil: NOW + 1000 }, NOW)).toBe("used-up");
    expect(promoState({ active: true, used: 0, validUntil: NOW - 1 }, NOW)).toBe("expired");
    // Every state has words the shop understands.
    for (const state of ["live", "scheduled", "paused", "used-up", "expired"] as const) {
      expect(PROMO_STATE_LABEL[state]).toBeTruthy();
    }
  });

  it("counts what is left, and says null when there is no cap", () => {
    expect(promoRemaining({ active: true, used: 7, usageLimit: 50 })).toBe(43);
    expect(promoRemaining({ active: true, used: 60, usageLimit: 50 })).toBe(0);
    expect(promoRemaining({ active: true, used: 1 })).toBeNull();
  });
});
