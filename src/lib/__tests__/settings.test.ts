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
});
