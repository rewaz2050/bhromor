import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS, sanitizeSettings } from "../settings-store";

describe("operational settings (§58)", () => {
  it("sanitizes the low-stock threshold", () => {
    expect(sanitizeSettings({ lowStockThreshold: 7 }).lowStockThreshold).toBe(7);
    expect(sanitizeSettings({ lowStockThreshold: -3 }).lowStockThreshold).toBe(0);
    expect(sanitizeSettings({ lowStockThreshold: 2.9 }).lowStockThreshold).toBe(2);
    expect(sanitizeSettings({ lowStockThreshold: "x" }).lowStockThreshold).toBe(
      SETTINGS_DEFAULTS.lowStockThreshold,
    );
    expect(sanitizeSettings(null).lowStockThreshold).toBe(
      SETTINGS_DEFAULTS.lowStockThreshold,
    );
  });

  it("sanitizes loyalty reward settings", () => {
    const custom = sanitizeSettings({
      loyaltyEnabled: false,
      loyaltyTargetOrders: 5,
      loyaltyRewardTitle: "সিল্ক স্কার্ফ",
      loyaltyRewardDescription: "৫টি অর্ডারে ফ্রি স্কার্ফ",
      loyaltyMinOrderAmount: 500,
    });
    expect(custom.loyaltyEnabled).toBe(false);
    expect(custom.loyaltyTargetOrders).toBe(5);
    expect(custom.loyaltyRewardTitle).toBe("সিল্ক স্কার্ফ");
    expect(custom.loyaltyRewardDescription).toBe("৫টি অর্ডারে ফ্রি স্কার্ফ");
    expect(custom.loyaltyMinOrderAmount).toBe(500);

    const fallback = sanitizeSettings({});
    expect(fallback.loyaltyEnabled).toBe(true);
    expect(fallback.loyaltyTargetOrders).toBe(10);
    expect(fallback.loyaltyRewardTitle).toBe(SETTINGS_DEFAULTS.loyaltyRewardTitle);
  });

  it("sanitizes wallet numbers to BD mobile (P1 #8) — blanks hide the method", () => {
    const ok = sanitizeSettings({
      wallets: { bkash: "01711-111111", nagad: "+8801822222222" },
    });
    expect(ok.wallets.bkash).toBe("01711111111");
    expect(ok.wallets.nagad).toBe("01822222222");

    // Implausible numbers are dropped, never printed in a checkout.
    const bad = sanitizeSettings({
      wallets: { bkash: "123", nagad: "not-a-number" },
    });
    expect(bad.wallets).toEqual({ bkash: "", nagad: "" });

    expect(sanitizeSettings({}).wallets).toEqual({ bkash: "", nagad: "" });
  });
});
