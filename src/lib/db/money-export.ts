import "server-only";

/**
 * Accounting export reader (item Y). Reads the money ledgers page by page for
 * a Dhaka-day window, then resolves rider / shop / order names in batches so
 * the sheet is readable. Uses the SERVICE client (the ledgers are RLS-closed)
 * — the route has already proven the caller is admin staff.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { isMissingDbObject } from "./riders";
import {
  EXPORT_ROW_CAP,
  EXPORT_SPECS,
  exportCsv,
  type ExportKind,
  type ExportLookups,
  type ExportRange,
} from "../money-export";

type Raw = Record<string, unknown>;

const PAGE = 1000;
const BATCH = 150;

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const ids = (rows: Raw[], key: string): string[] => [
  ...new Set(rows.flatMap((r) => (typeof r[key] === "string" && r[key] ? [r[key] as string] : []))),
];

/** Rows in [from, to), oldest first, up to EXPORT_ROW_CAP (one extra is read to know if it was cut). */
const readRows = async (
  service: SupabaseClient,
  kind: ExportKind,
  range: ExportRange,
): Promise<{ rows: Raw[]; truncated: boolean }> => {
  const spec = EXPORT_SPECS[kind];
  const rows: Raw[] = [];
  for (let offset = 0; offset <= EXPORT_ROW_CAP; offset += PAGE) {
    const { data, error } = await service
      .from(spec.table)
      .select(spec.select)
      .gte(spec.dateColumn, range.fromIso)
      .lt(spec.dateColumn, range.toIso)
      .order(spec.dateColumn, { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (isMissingDbObject(error)) {
        throw new AdminInputError("This ledger is not set up on the database yet (a migration has not been run).", 409);
      }
      throw new Error("money export read failed");
    }
    const page = (data ?? []) as unknown as Raw[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const truncated = rows.length > EXPORT_ROW_CAP;
  return { rows: truncated ? rows.slice(0, EXPORT_ROW_CAP) : rows, truncated };
};

const lookups = async (service: SupabaseClient, rows: Raw[]): Promise<ExportLookups> => {
  const out: ExportLookups = { riders: new Map(), shops: new Map(), orders: new Map() };
  const read = async (
    table: string,
    select: string,
    idList: string[],
    each: (r: Raw) => void,
  ): Promise<void> => {
    for (const part of chunk(idList, BATCH)) {
      const { data } = await service.from(table).select(select).in("id", part);
      for (const r of (data ?? []) as unknown as Raw[]) each(r);
    }
  };
  await Promise.all([
    read("riders", "id,name,phone", ids(rows, "rider_id"), (r) =>
      out.riders.set(String(r.id), { name: String(r.name ?? ""), phone: String(r.phone ?? "") })),
    read("shops", "id,name", ids(rows, "shop_id"), (r) => out.shops.set(String(r.id), String(r.name ?? ""))),
    read("orders", "id,order_no", ids(rows, "order_id"), (r) => {
      if (r.order_no) out.orders.set(String(r.id), String(r.order_no));
    }),
  ]);
  return out;
};

export const buildMoneyExport = async (
  service: SupabaseClient,
  kind: ExportKind,
  range: ExportRange,
): Promise<{ csv: string; count: number; truncated: boolean }> => {
  const { rows, truncated } = await readRows(service, kind, range);
  const l = await lookups(service, rows);
  return { csv: exportCsv(kind, rows, l), count: rows.length, truncated };
};
