import { describe, expect, it } from "vitest";
import { computeNet, parsePnlRange, pnlWindow, type MoneyPnl } from "../money-pnl";

const base: MoneyPnl = {
  deliveredOrders: 0,
  returnLegs: 0,
  commission: 0,
  deliveryIncome: 0,
  shopFundedFreeDelivery: 0,
  riderFees: 0,
  riderAdjustments: 0,
  discountsGiven: 0,
  shopFundedDiscounts: 0,
  tipsCollected: 0,
  tipsToRiders: 0,
};

describe("computeNet (audit N7)", () => {
  it("income − rider pay − absorbed discounts", () => {
    const r = computeNet({
      ...base,
      deliveredOrders: 4,
      commission: 20000,
      deliveryIncome: 24000,
      riderFees: 16000,
      discountsGiven: 9000,
      shopFundedDiscounts: 4000,
    });
    expect(r).toMatchObject({ revenue: 44000, riderCost: 16000, platformDiscounts: 5000, net: 23000, perOrder: 5750, deliveryMarginPerOrder: 2000 });
  });

  it("tips never count as income or cost — they only show as held", () => {
    const r = computeNet({ ...base, tipsCollected: 8000, tipsToRiders: 5000 });
    expect(r.net).toBe(0);
    expect(r.tipsHeld).toBe(3000);
  });

  it("a shop funding more than the discount cannot create income", () => {
    expect(computeNet({ ...base, discountsGiven: 1000, shopFundedDiscounts: 5000 }).platformDiscounts).toBe(0);
  });

  it("signed rider adjustments move the cost; shop-funded free delivery is income", () => {
    const r = computeNet({ ...base, riderFees: 10000, riderAdjustments: -2000, shopFundedFreeDelivery: 3000 });
    expect(r.riderCost).toBe(8000);
    expect(r.net).toBe(3000 - 8000);
  });

  it("no delivered orders → no per-order figure (no divide by zero)", () => {
    const r = computeNet({ ...base, commission: 100 });
    expect(r.perOrder).toBeNull();
    expect(r.deliveryMarginPerOrder).toBeNull();
  });
});

describe("pnlWindow / parsePnlRange", () => {
  const now = new Date("2026-10-01T20:30:00.000Z"); // 02:30 on 2 Oct in Dhaka

  it("today starts at Dhaka midnight, not UTC midnight", () => {
    expect(pnlWindow("today", now).from).toBe("2026-10-01T18:00:00.000Z");
  });

  it("7d / 30d are rolling windows; all is open", () => {
    expect(pnlWindow("7d", now).from).toBe("2026-09-24T20:30:00.000Z");
    expect(pnlWindow("30d", now).from).toBe("2026-09-01T20:30:00.000Z");
    expect(pnlWindow("all", now)).toEqual({ from: null, to: null });
  });

  it("unknown ranges fall back to 30 days", () => {
    expect(parsePnlRange("nope")).toBe("30d");
    expect(parsePnlRange("today")).toBe("today");
  });
});
