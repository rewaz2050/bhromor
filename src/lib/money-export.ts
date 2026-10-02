/**
 * Accounting CSV exports (item Y) — the pure half: which ledgers can be
 * exported, the Dhaka-day range parser, and how each raw row becomes a
 * spreadsheet line (taka not paisa, local Dhaka time, formula-safe cells).
 * The database reads live in `db/money-export.ts`.
 */

import { csvField, takaCell } from "./csv";
import { describeAudit, AUDIT_EVENT_LABEL, type AuditEvent } from "./money-audit";
import { todayDhaka } from "./money-daily";

export const EXPORT_KINDS = [
  "rider_wallet",
  "rider_payouts",
  "rider_settlements",
  "shop_ledger",
  "shop_payouts",
  "audit",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_LABEL: Record<ExportKind, string> = {
  rider_wallet: "Rider wallet journal (every credit / debit)",
  rider_payouts: "Rider payout requests",
  rider_settlements: "Rider COD settlements (cash handed in)",
  shop_ledger: "Shop ledger (what each delivered order owes the shop)",
  shop_payouts: "Shop payouts (money sent to shops)",
  audit: "Money audit trail (who approved what)",
};

/** Hard ceiling so one click can never pull the whole database. */
export const EXPORT_ROW_CAP = 20_000;
export const EXPORT_MAX_DAYS = 366;
export const EXPORT_DEFAULT_DAYS = 30;

export const parseExportKind = (raw: string | null | undefined): ExportKind | null =>
  (EXPORT_KINDS as readonly string[]).includes(raw ?? "") ? (raw as ExportKind) : null;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const realDay = (raw: string | null | undefined): string | null => {
  const m = DAY_RE.exec((raw ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export interface ExportRange {
  /** Inclusive Dhaka days. */
  from: string;
  to: string;
  /** [fromIso, toIso) as UTC instants. */
  fromIso: string;
  toIso: string;
}

/**
 * Inclusive Dhaka-day range. Blank → the last 30 days. A garbage date, a
 * reversed range or one longer than a year is an error (not a silent guess —
 * the accountant must get exactly the period they asked for).
 */
export const parseExportRange = (
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  now: number = Date.now(),
): { ok: true; range: ExportRange } | { ok: false; error: string } => {
  const today = todayDhaka(now);
  const hasFrom = (fromRaw ?? "").trim() !== "";
  const hasTo = (toRaw ?? "").trim() !== "";
  const toParsed = hasTo ? realDay(toRaw) : today;
  if (!toParsed) return { ok: false, error: "The end date is not a valid day (use YYYY-MM-DD)." };
  const to = toParsed > today ? today : toParsed;
  const fromParsed = hasFrom ? realDay(fromRaw) : addDays(to, -(EXPORT_DEFAULT_DAYS - 1));
  if (!fromParsed) return { ok: false, error: "The start date is not a valid day (use YYYY-MM-DD)." };
  if (fromParsed > to) return { ok: false, error: "The start date is after the end date." };
  if (daysBetween(fromParsed, to) + 1 > EXPORT_MAX_DAYS) {
    return { ok: false, error: `Pick at most ${EXPORT_MAX_DAYS} days per export.` };
  }
  return {
    ok: true,
    range: {
      from: fromParsed,
      to,
      fromIso: `${fromParsed}T00:00:00+06:00`,
      toIso: `${addDays(to, 1)}T00:00:00+06:00`,
    },
  };
};

type Raw = Record<string, unknown>;

export interface ExportLookups {
  riders: Map<string, { name: string; phone: string }>;
  shops: Map<string, string>;
  orders: Map<string, string>;
}

export interface ExportSpec {
  table: string;
  dateColumn: string;
  select: string;
  header: string[];
  row: (r: Raw, l: ExportLookups) => unknown[];
}

const s = (v: unknown): string => (v == null ? "" : String(v));
/**
 * A money cell. csvField defuses a leading "-" (formula injection), which
 * would turn every DEBIT into text the accountant cannot sum — so amounts are
 * a distinct type that is written as the bare number it is.
 */
export class Amount {
  constructor(readonly text: string) {}
  toString(): string {
    return this.text;
  }
}
const paisa = (v: unknown): Amount => new Amount(takaCell(Number(v) || 0));

const exportLine = (fields: readonly unknown[]): string =>
  fields.map((f) => (f instanceof Amount ? f.text : csvField(f))).join(",");

/** "2026-10-02 14:30" in Dhaka time (UTC+6), regardless of the server's zone. */
export const dhakaStamp = (iso: unknown): string => {
  const ms = Date.parse(s(iso));
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 6 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
};

const rider = (r: Raw, l: ExportLookups) => l.riders.get(s(r.rider_id));
const orderNo = (r: Raw, l: ExportLookups) => (r.order_id ? l.orders.get(s(r.order_id)) ?? "" : "");

export const EXPORT_SPECS: Record<ExportKind, ExportSpec> = {
  rider_wallet: {
    table: "rider_earnings",
    dateColumn: "created_at",
    select: "id,rider_id,order_id,kind,amount,payout_id,note,created_at",
    header: ["Date (Dhaka)", "Rider", "Rider phone", "Kind", "Order", "Amount (Tk)", "Note", "Entry id"],
    row: (r, l) => [
      dhakaStamp(r.created_at), rider(r, l)?.name ?? "", rider(r, l)?.phone ?? "", s(r.kind), orderNo(r, l),
      paisa(r.amount), s(r.note), s(r.id),
    ],
  },
  rider_payouts: {
    table: "rider_payout_requests",
    dateColumn: "requested_at",
    select: "id,rider_id,amount,method,account,status,requested_at,decided_at,decided_by_email,reference,note",
    header: ["Requested (Dhaka)", "Rider", "Rider phone", "Amount (Tk)", "Method", "Account", "Status", "Decided (Dhaka)", "Decided by", "Reference", "Note", "Request id"],
    row: (r, l) => [
      dhakaStamp(r.requested_at), rider(r, l)?.name ?? "", rider(r, l)?.phone ?? "", paisa(r.amount), s(r.method),
      s(r.account), s(r.status), dhakaStamp(r.decided_at), s(r.decided_by_email), s(r.reference), s(r.note), s(r.id),
    ],
  },
  rider_settlements: {
    table: "rider_settlements",
    dateColumn: "settled_at",
    select: "id,rider_id,amount,method,reference,settled_at",
    header: ["Settled (Dhaka)", "Rider", "Rider phone", "Amount (Tk)", "Method", "Reference", "Settlement id"],
    row: (r, l) => [
      dhakaStamp(r.settled_at), rider(r, l)?.name ?? "", rider(r, l)?.phone ?? "", paisa(r.amount), s(r.method), s(r.reference), s(r.id),
    ],
  },
  shop_ledger: {
    table: "shop_ledger",
    dateColumn: "created_at",
    select: "id,shop_id,order_id,subtotal,commission,payable,created_at",
    header: ["Date (Dhaka)", "Shop", "Order", "Items subtotal (Tk)", "Commission (Tk)", "Payable to shop (Tk)", "Ledger id"],
    row: (r, l) => [
      dhakaStamp(r.created_at), l.shops.get(s(r.shop_id)) ?? "", orderNo(r, l), paisa(r.subtotal), paisa(r.commission), paisa(r.payable), s(r.id),
    ],
  },
  shop_payouts: {
    table: "shop_payouts",
    dateColumn: "paid_at",
    select: "id,shop_id,amount,method,reference,paid_at",
    header: ["Paid (Dhaka)", "Shop", "Amount (Tk)", "Method", "Reference", "Payout id"],
    row: (r, l) => [dhakaStamp(r.paid_at), l.shops.get(s(r.shop_id)) ?? "", paisa(r.amount), s(r.method), s(r.reference), s(r.id)],
  },
  audit: {
    table: "money_audit_log",
    dateColumn: "at",
    select: "id,at,actor_email,event,subject_type,subject_id,amount,detail",
    header: ["When (Dhaka)", "Who", "Event", "Subject", "Subject id", "Amount (Tk)", "Detail", "Audit id"],
    row: (r) => {
      const detail = (r.detail && typeof r.detail === "object" ? r.detail : {}) as Record<string, unknown>;
      const event = s(r.event);
      return [
        dhakaStamp(r.at), s(r.actor_email), AUDIT_EVENT_LABEL[event as AuditEvent] ?? event, s(r.subject_type), s(r.subject_id),
        r.amount == null ? "" : paisa(r.amount),
        describeAudit({ event, detail, subjectId: r.subject_id == null ? null : s(r.subject_id) }), s(r.id),
      ];
    },
  },
};

/** Whole file: UTF-8 BOM first so Excel reads Bangla names correctly. */
export const exportCsv = (kind: ExportKind, rows: readonly Raw[], lookups: ExportLookups): string => {
  const spec = EXPORT_SPECS[kind];
  return "\uFEFF" + [exportLine(spec.header), ...rows.map((r) => exportLine(spec.row(r, lookups)))].join("\r\n") + "\r\n";
};

export const exportFilename = (kind: ExportKind, range: ExportRange): string =>
  `prosanti-${kind.replace(/_/g, "-")}-${range.from}_to_${range.to}.csv`;
