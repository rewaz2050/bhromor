import { describe, expect, it } from "vitest";
import {
  DISPATCH_BOUNDS,
  DISPATCH_DEFAULTS,
  DISPATCH_KEYS,
  parseDispatchSettings,
  sanitizeDispatchSettings,
} from "../dispatch-settings";

describe("dispatch settings (J)", () => {
  it("defaults equal the values that used to be hardcoded", () => {
    expect(DISPATCH_DEFAULTS).toEqual({ cashCap: 500_000, offerTtl: 90, maxAttempts: 2, loadLimit: 2 });
    expect(DISPATCH_KEYS).toEqual({
      cashCap: "rider_cash_cap_paisa",
      offerTtl: "offer_ttl_seconds",
      maxAttempts: "delivery_max_attempts",
      loadLimit: "rider_load_limit",
    });
  });

  it("accepts whole numbers inside the bounds, as numbers or numeric strings", () => {
    expect(parseDispatchSettings({ cashCap: 300_000, offerTtl: "45", maxAttempts: 3 })).toEqual({
      settings: { cashCap: 300_000, offerTtl: 45, maxAttempts: 3, loadLimit: 2 },
    });
    const { min, max } = DISPATCH_BOUNDS.offerTtl;
    expect(parseDispatchSettings({ ...DISPATCH_DEFAULTS, offerTtl: min }).error).toBeUndefined();
    expect(parseDispatchSettings({ ...DISPATCH_DEFAULTS, offerTtl: max }).error).toBeUndefined();
  });

  it.each([
    [{ cashCap: 49_999 }, /cash limit/i],
    [{ cashCap: 5_000_001 }, /cash limit/i],
    [{ cashCap: 1234.5 }, /cash limit/i],
    [{ offerTtl: 29 }, /offer window/i],
    [{ offerTtl: 601 }, /offer window/i],
    [{ offerTtl: "abc" }, /offer window/i],
    [{ maxAttempts: 0 }, /attempts/i],
    [{ maxAttempts: 6 }, /attempts/i],
    [{ maxAttempts: null }, /attempts/i],
    [{ loadLimit: 0 }, /active jobs/i],
    [{ loadLimit: 6 }, /active jobs/i],
    [{ loadLimit: 2.5 }, /active jobs/i],
    [{ loadLimit: null }, /active jobs/i],
  ])("refuses %j with a message naming the field", (patch, message) => {
    const out = parseDispatchSettings({ ...DISPATCH_DEFAULTS, ...patch });
    expect(out.error).toMatch(message);
    expect(out.settings).toEqual(DISPATCH_DEFAULTS);
  });

  it("an older client that sends only the first three fields keeps the default load limit", () => {
    expect(parseDispatchSettings({ cashCap: 300_000, offerTtl: 60, maxAttempts: 3 })).toEqual({
      settings: { cashCap: 300_000, offerTtl: 60, maxAttempts: 3, loadLimit: 2 },
    });
    expect(parseDispatchSettings({ ...DISPATCH_DEFAULTS, loadLimit: 4 }).settings.loadLimit).toBe(4);
  });

  it("refuses a missing body instead of saving defaults over a configured value", () => {
    expect(parseDispatchSettings(undefined).error).toBeTruthy();
    expect(parseDispatchSettings({}).error).toBeTruthy();
  });

  it("lenient read: bad fields fall back, strays are clamped like the SQL helpers", () => {
    expect(sanitizeDispatchSettings(null)).toEqual(DISPATCH_DEFAULTS);
    expect(sanitizeDispatchSettings({ cashCap: "x", offerTtl: 5, maxAttempts: 99 })).toEqual({
      cashCap: 500_000,
      offerTtl: 30,
      maxAttempts: 5,
      loadLimit: 2,
    });
    expect(sanitizeDispatchSettings({ loadLimit: 0 }).loadLimit).toBe(1);
    expect(sanitizeDispatchSettings({ loadLimit: 40 }).loadLimit).toBe(5);
    expect(sanitizeDispatchSettings({ cashCap: 10, offerTtl: 99_999 })).toMatchObject({ cashCap: 50_000, offerTtl: 600, maxAttempts: 2 });
  });
});
