import { describe, expect, it } from "vitest";
import { sanitizeSettings, SETTINGS_DEFAULTS } from "../settings-store";
import { deliveryBreakdown, weightExtraCharge } from "../delivery";

describe("admin-editable delivery rates (2026-09-21)", () => {
  it("sanitize clamps the amounts and keeps sane defaults", () => {
    const settings = sanitizeSettings({
      surcharges: { night: 3000, rain: -5, express: 999999, weightPerKg: 1200 },
      courierMinOrderPaisa: 80000,
    });
    expect(settings.surcharges).toEqual({ night: 3000, rain: 0, express: 50000, weightPerKg: 1200 });
    expect(settings.courierMinOrderPaisa).toBe(80000);
    // defaults match the launch constants
    expect(SETTINGS_DEFAULTS.surcharges).toEqual({ night: 2000, rain: 1500, express: 4000, weightPerKg: 1000 });
    expect(SETTINGS_DEFAULTS.courierMinOrderPaisa).toBe(50000);
  });

  it("a garbage document falls back to every default", () => {
    const settings = sanitizeSettings({ surcharges: "free money", courierMinOrderPaisa: "না" });
    expect(settings.surcharges).toEqual(SETTINGS_DEFAULTS.surcharges);
    expect(settings.courierMinOrderPaisa).toBe(50000);
  });

  it("deliveryBreakdown charges the owner's rates, not the constants", () => {
    const zone = { id: "z1", name: "Sadar", areas: [], charge: 6000, etaLabel: "40–50 min" };
    const base = deliveryBreakdown({
      zone,
      subtotal: 100000,
      isNight: true,
      isExpress: true,
      weightKg: 6,
    });
    expect(base.surcharge.night).toBe(2000);
    expect(base.surcharge.express).toBe(4000);
    expect(base.surcharge.weight).toBe(1000);

    const custom = deliveryBreakdown({
      zone,
      subtotal: 100000,
      isNight: true,
      isExpress: true,
      weightKg: 6,
      rates: { night: 3000, rain: 1500, express: 5000, weightPerKg: 1500 },
    });
    expect(custom.surcharge.night).toBe(3000);
    expect(custom.surcharge.express).toBe(5000);
    expect(custom.surcharge.weight).toBe(1500);
  });

  it("weightExtraCharge honours a custom per-kg rate", () => {
    expect(weightExtraCharge(6)).toBe(1000);
    expect(weightExtraCharge(6, 2500)).toBe(2500);
    expect(weightExtraCharge(5, 2500)).toBe(0);
  });
});
