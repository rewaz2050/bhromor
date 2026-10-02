import { describe, expect, it } from "vitest";
import { DAILY_CHECK_KEYS, dailyToText, normalizeDaily, parseDay, shiftDay, todayDhaka } from "../money-daily";

describe("Dhaka day helpers (audit U)", () => {
  it("todayDhaka rolls over at Dhaka midnight (18:00 UTC)", () => {
    expect(todayDhaka(Date.parse("2026-10-01T17:59:00Z"))).toBe("2026-10-01");
    expect(todayDhaka(Date.parse("2026-10-01T18:00:00Z"))).toBe("2026-10-02");
  });

  it("parseDay keeps real past days and falls back to today for junk or the future", () => {
    const now = Date.parse("2026-10-01T05:00:00Z");
    expect(parseDay("2026-09-15", now)).toBe("2026-09-15");
    expect(parseDay("2026-02-30", now)).toBe("2026-10-01");
    expect(parseDay("tomorrow", now)).toBe("2026-10-01");
    expect(parseDay(null, now)).toBe("2026-10-01");
    expect(parseDay("2027-01-01", now)).toBe("2026-10-01");
  });

  it("shiftDay crosses month and year ends", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("normalizeDaily", () => {
  it("coerces numeric strings and fills missing keys with 0", () => {
    const d = normalizeDaily({ day: "2026-10-01", flows: { orderValue: "80000" }, position: { codCustody: "5" }, checks: [] });
    expect(d.flows.orderValue).toBe(80000);
    expect(d.flows.commission).toBe(0);
    expect(d.position.codCustody).toBe(5);
  });

  it("never reports a check the database did not return as passing", () => {
    const d = normalizeDaily({ checks: [{ key: "wallet_journal", ok: true, count: 0, sample: [] }] });
    expect(d.checks.map((c) => c.key)).toEqual([...DAILY_CHECK_KEYS]);
    expect(d.checks.find((c) => c.key === "wallet_journal")?.ok).toBe(true);
    expect(d.checks.find((c) => c.key === "negative_cash")?.ok).toBe(false);
  });
});

describe("dailyToText", () => {
  const clean = normalizeDaily({
    day: "2026-10-01",
    flows: { deliveredOrders: 12, orderValue: 1200000, codCollectedByRiders: 800000, cashHandedIn: 500000, settlementsCount: 2, settlementsNetted: 50000 },
    position: { codCustody: 300000, riderPayable: 40000, shopPayable: 700000 },
    checks: DAILY_CHECK_KEYS.map((key) => ({ key, ok: true, count: 0, sample: [] })),
  });

  it("summarises the day in plain text", () => {
    const t = dailyToText(clean);
    expect(t).toContain("PROSANTI money — 2026-10-01");
    expect(t).toContain("Delivered 12 orders (৳12,000)");
    expect(t).toContain("handed in ৳5,000 cash (+৳500 netted from wallets)");
    expect(t).toContain("Checks: all clear");
  });

  it("says nothing about shop wallets when none moved, and names both flows when they did", () => {
    expect(dailyToText(clean)).not.toMatch(/own wallets|remitted/);
    const both = normalizeDaily({ day: "2026-10-01", flows: { walletPaidOrders: 900000, shopWalletOrders: 300000, shopPayoutsPaid: 200000, shopRemittances: 50000 }, position: {}, checks: [] });
    const t = dailyToText(both);
    expect(t).toContain("wallet-paid ৳9,000 (of which ৳3,000 went to shops' own wallets)");
    expect(t).toContain("shops remitted ৳500");
    expect(normalizeDaily({ flows: {} }).flows).toMatchObject({ shopWalletOrders: 0, shopRemittances: 0 });
  });

  it("lists what needs attention", () => {
    const bad = { ...clean, checks: clean.checks.map((c) => (c.key === "stale_payouts" ? { ...c, ok: false, count: 3 } : c)) };
    const t = dailyToText(bad);
    expect(t).toContain("1 need attention");
    expect(t).toContain("No rider payout waiting over 48 hours (3)");
  });
});
