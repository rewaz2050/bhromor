/**
 * CSV for the shop owner's spreadsheet (2026-09-18).
 *
 * The old export joined raw fields with commas: money came out in paisa
 * (a ৳1,200 order read `120000`), a customer name containing a quote broke
 * its row, and Excel opened the Bangla names as mojibake because the file
 * had no BOM. This module is pure (no DOM) so it is unit-testable; the
 * download helper lives next to it.
 */

import type { Order } from "./orders";
import { paymentSummary } from "./payment-labels";

/** RFC 4180 field: quote when needed, double embedded quotes. */
export const csvField = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // A leading = + - @ would be executed as a formula by Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const csvLine = (fields: readonly unknown[]): string =>
  fields.map(csvField).join(",");

/** Integer paisa → "1200.50" taka for a spreadsheet number column. */
export const takaCell = (paisa: number): string => (paisa / 100).toFixed(2);

/** Local-time "YYYY-MM-DD HH:mm" — what the owner's clock says, not UTC. */
export const localStamp = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const ORDER_CSV_HEADER = [
  "Order",
  "Placed",
  "Status",
  "Customer",
  "Phone",
  "Area",
  "Address",
  "Items",
  "Subtotal (Tk)",
  "Delivery (Tk)",
  "Discount (Tk)",
  "Total (Tk)",
  "Payment",
  "Payment status",
  "Coupon",
  "Rider",
  "Type",
] as const;

export const orderCsvRow = (o: Order): string =>
  csvLine([
    o.id,
    localStamp(o.createdAt),
    o.status,
    o.customer.name,
    o.customer.phone,
    o.customer.area,
    o.customer.address,
    o.items.map((it) => `${it.qty}× ${it.name}${it.variant ? ` (${it.variant})` : ""}`).join("; "),
    takaCell(o.subtotal),
    takaCell(o.deliveryCharge),
    takaCell(o.coupon?.discount ?? 0),
    takaCell(o.total),
    paymentSummary(o).label,
    o.payment === "cod" ? "" : (o.paymentStatus ?? ""),
    o.coupon?.code ?? "",
    o.rider?.name ?? "",
    o.isReturn ? "return" : o.isPickup ? "pickup" : "delivery",
  ]);

/** Whole file, UTF-8 BOM first so Excel reads Bangla names correctly. */
export const ordersCsv = (orders: readonly Order[]): string =>
  "\uFEFF" + [csvLine(ORDER_CSV_HEADER), ...orders.map(orderCsvRow)].join("\r\n") + "\r\n";

/** Trigger a browser download of `text` as `filename`. */
export const downloadText = (filename: string, text: string, type = "text/csv;charset=utf-8"): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const csvDateSuffix = (ms: number = Date.now()): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};
