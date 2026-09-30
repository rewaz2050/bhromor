/**
 * A5 (2026-09-28) — the payout statement (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * The earnings page listed the ledger and the payouts, but a shop that pays
 * advance tax or reconciles with a partner needs a month's numbers in one
 * file. This builds that file — and the same totals the screen shows, so the
 * CSV and the screen can never disagree.
 *
 * Only rows the server already sent are used; nothing is estimated and an
 * empty month produces a header-only file rather than a fabricated row.
 */

import { csvDateSuffix, csvLine, localStamp, takaCell } from "./csv";
import type { VendorEarnings } from "./db/vendor";

export type StatementEntryKind = "order" | "payout";

export interface StatementEntry {
  kind: StatementEntryKind;
  at: number;
  /** Order number for sales, payout reference (or method) for payouts. */
  reference: string;
  /** Sale amount (items only, before commission) in paisa. */
  sale: number;
  /** Platform commission in paisa (0 for payouts). */
  commission: number;
  /** Delivery/tip/surcharge pass-through in paisa (order rows only). */
  extras: number;
  /** Money the shop received: payable for orders, amount for payouts. */
  amount: number;
}

export interface StatementTotals {
  orders: number;
  sales: number;
  commission: number;
  extras: number;
  payable: number;
  payouts: number;
  /** payable − payouts for the month (negative means paid ahead). */
  net: number;
}

/** "2026-09" in the shop's own timezone — the same clock the rows show. */
export const monthKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Every month that has anything in it, newest first. */
export const statementMonths = (earnings: VendorEarnings): string[] => {
  const keys = new Set<string>();
  for (const row of earnings.ledger) keys.add(monthKey(row.at));
  for (const row of earnings.payouts) keys.add(monthKey(row.at));
  return [...keys].sort((a, b) => b.localeCompare(a));
};

/** One month's rows: sales first (oldest first), then payouts. */
export const statementEntries = (
  earnings: VendorEarnings,
  month: string,
): StatementEntry[] => {
  const orders: StatementEntry[] = earnings.ledger
    .filter((r) => monthKey(r.at) === month)
    .map((r) => ({
      kind: "order" as const,
      at: r.at,
      reference: r.orderNo || r.orderId.slice(0, 8),
      sale: r.subtotal,
      commission: r.commission,
      extras: (r.deliveryCharge ?? 0) + (r.tipAmount ?? 0) + (r.surchargeTotal ?? 0),
      amount: r.payable,
    }))
    .sort((a, b) => a.at - b.at);
  const payouts: StatementEntry[] = earnings.payouts
    .filter((r) => monthKey(r.at) === month)
    .map((r) => ({
      kind: "payout" as const,
      at: r.at,
      reference: r.reference || r.method,
      sale: 0,
      commission: 0,
      extras: 0,
      amount: r.amount,
    }))
    .sort((a, b) => a.at - b.at);
  return [...orders, ...payouts];
};

export const statementTotals = (entries: StatementEntry[]): StatementTotals => {
  const orders = entries.filter((e) => e.kind === "order");
  const payouts = entries.filter((e) => e.kind === "payout");
  const sales = orders.reduce((sum, e) => sum + e.sale, 0);
  const commission = orders.reduce((sum, e) => sum + e.commission, 0);
  const extras = orders.reduce((sum, e) => sum + e.extras, 0);
  const payable = orders.reduce((sum, e) => sum + e.amount, 0);
  const paid = payouts.reduce((sum, e) => sum + e.amount, 0);
  return {
    orders: orders.length,
    sales,
    commission,
    extras,
    payable,
    payouts: paid,
    net: payable - paid,
  };
};

/** Human month label, e.g. "September 2026" (the file name uses the key). */
export const monthLabel = (month: string): string => {
  const [year, m] = month.split("-");
  const index = Number(m) - 1;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[index] ?? m} ${year}`;
};

export const STATEMENT_HEADER = [
  "Date",
  "Type",
  "Reference",
  "Sale (Tk)",
  "Commission (Tk)",
  "Delivery/Tip/Sur (Tk)",
  "Paid to you (Tk)",
] as const;

export const statementRowLine = (e: StatementEntry): string =>
  csvLine([
    localStamp(e.at),
    e.kind,
    e.reference,
    e.sale ? takaCell(e.sale) : "",
    e.commission ? takaCell(e.commission) : "",
    e.extras ? takaCell(e.extras) : "",
    takaCell(e.amount),
  ]);

/** CSV text (BOM first) for one month, plus an honest totals block. */
export const statementCsv = (earnings: VendorEarnings, month: string): string => {
  const entries = statementEntries(earnings, month);
  const totals = statementTotals(entries);
  const lines = [
    csvLine(STATEMENT_HEADER),
    ...entries.map(statementRowLine),
    "",
    csvLine(["Totals", monthLabel(month)]),
    csvLine(["Orders", totals.orders, "Sales (Tk)", takaCell(totals.sales)]),
    csvLine(["Commission (Tk)", takaCell(totals.commission)]),
    csvLine(["Delivery/Tip/Sur (Tk)", takaCell(totals.extras)]),
    csvLine(["Payable (Tk)", takaCell(totals.payable)]),
    csvLine(["Paid out (Tk)", takaCell(totals.payouts)]),
    csvLine(["Net (Tk)", takaCell(totals.net)]),
  ];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
};

export const statementFilename = (month: string, now: number = Date.now()): string =>
  `prosanti-statement-${month}-${csvDateSuffix(now)}.csv`;
