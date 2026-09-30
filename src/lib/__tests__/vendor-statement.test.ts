/**
 * A5 — the payout statement. The screen and the CSV read the same totals,
 * and an empty month produces a header-only file, never a made-up row.
 */
import { describe, expect, it } from "vitest";
import type { VendorEarnings } from "../db/vendor";
import {
  monthKey,
  monthLabel,
  statementCsv,
  statementEntries,
  statementFilename,
  statementMonths,
  statementTotals,
} from "../vendor-statement";

const at = (iso: string) => Date.parse(iso);

const earnings: VendorEarnings = {
  lifetimePayable: 300_000,
  lifetimePaid: 100_000,
  balance: 200_000,
  ledger: [
    {
      id: "l1",
      orderId: "11111111-2222-3333-4444-555555555555",
      orderNo: "PS-1001",
      subtotal: 120_000,
      commission: 18_000,
      payable: 102_000,
      deliveryCharge: 6_000,
      tipAmount: 2_000,
      at: at("2026-09-10T12:00:00+06:00"),
    },
    {
      id: "l2",
      orderId: "99999999-2222-3333-4444-555555555555",
      orderNo: "PS-1002",
      subtotal: 80_000,
      commission: 12_000,
      payable: 68_000,
      at: at("2026-09-03T09:00:00+06:00"),
    },
    {
      id: "l3",
      orderId: "88888888-2222-3333-4444-555555555555",
      orderNo: "PS-0900",
      subtotal: 50_000,
      commission: 7_500,
      payable: 42_500,
      at: at("2026-08-28T09:00:00+06:00"),
    },
  ],
  payouts: [
    {
      id: "o1",
      amount: 100_000,
      method: "bKash",
      reference: "TRX123",
      at: at("2026-09-12T16:00:00+06:00"),
    },
    { id: "o2", amount: 20_000, method: "bKash", reference: "", at: at("2026-08-30T16:00:00+06:00") },
  ],
};

describe("statementMonths / monthKey", () => {
  it("lists every month with rows, newest first, on the shop's own clock", () => {
    // Midday of the first of the month: the same month in Dhaka AND in the
    // CI runner's UTC clock, so this test never depends on the machine.
    expect(monthKey(at("2026-09-01T12:00:00+06:00"))).toBe("2026-09");
    expect(statementMonths(earnings)).toEqual(["2026-09", "2026-08"]);
    expect(monthLabel("2026-09")).toBe("September 2026");
  });
});

describe("statementEntries", () => {
  it("keeps one month's sales (oldest first) and payouts, nothing else", () => {
    const entries = statementEntries(earnings, "2026-09");
    expect(entries.map((e) => e.reference)).toEqual(["PS-1002", "PS-1001", "TRX123"]);
    expect(entries.map((e) => e.kind)).toEqual(["order", "order", "payout"]);
    expect(entries[1].extras).toBe(8_000); // delivery 6000 + tip 2000
  });

  it("falls back to the row id prefix when the order number is unreadable", () => {
    const broken: VendorEarnings = {
      ...earnings,
      ledger: [{ ...earnings.ledger[0], orderNo: "" }],
      payouts: [],
    };
    expect(statementEntries(broken, "2026-09")[0].reference).toBe("11111111");
  });
});

describe("statementTotals", () => {
  it("adds the month up without double counting payouts as sales", () => {
    const totals = statementTotals(statementEntries(earnings, "2026-09"));
    expect(totals.orders).toBe(2);
    expect(totals.sales).toBe(200_000);
    expect(totals.commission).toBe(30_000);
    expect(totals.extras).toBe(8_000);
    expect(totals.payable).toBe(170_000);
    expect(totals.payouts).toBe(100_000);
    expect(totals.net).toBe(70_000);
  });

  it("answers zeros for a month with nothing in it", () => {
    const totals = statementTotals(statementEntries(earnings, "2026-07"));
    expect(totals).toEqual({
      orders: 0,
      sales: 0,
      commission: 0,
      extras: 0,
      payable: 0,
      payouts: 0,
      net: 0,
    });
  });
});

/** BOM off, blank lines out — what a spreadsheet actually loads. */
const rowsOf = (csv: string): string[] =>
  csv.replace(/^\uFEFF/, "").split("\r\n").filter((line) => line !== "");

describe("statementCsv", () => {
  it("writes a BOM, the header, the month's rows and an honest totals block", () => {
    const csv = statementCsv(earnings, "2026-09");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const rows = rowsOf(csv);
    expect(rows[0]).toContain("Date,Type,Reference,Sale (Tk)");
    expect(rows.some((l) => l.startsWith("2026-09-03") && l.includes("PS-1002"))).toBe(true);
    expect(rows.some((l) => l.includes("payout,TRX123"))).toBe(true);
    expect(rows).toContain("Payable (Tk),1700.00");
    expect(rows).toContain("Net (Tk),700.00");
  });

  it("still writes a real file for a month with no rows", () => {
    const rows = rowsOf(statementCsv(earnings, "2026-07"));
    expect(rows[0]).toContain("Date,Type,Reference");
    expect(rows[1]).toBe("Totals,July 2026");
    expect(rows).toContain("Orders,0,Sales (Tk),0.00");
  });
});

describe("statementFilename", () => {
  it("names the file with the month and the day it was made", () => {
    expect(statementFilename("2026-09", at("2026-09-28T10:00:00+06:00"))).toBe(
      "prosanti-statement-2026-09-20260928.csv",
    );
  });
});
