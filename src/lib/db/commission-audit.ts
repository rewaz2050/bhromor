/**
 * C4 (2026-09-29) — reading a shop's commission trail.
 *
 * The database writes the trail (trigger in 202609290001); this is the part
 * that turns rows into an answer to "আমার তো ১২% ছিল" — who moved the rate,
 * when, and from how much to how much, oldest line first so the story reads
 * the way it happened.
 *
 * Read-only on purpose: nothing here can add a line, because a line added by
 * hand is the one thing an audit trail must never contain.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";

export interface CommissionChange {
  id: string;
  shopId: string;
  /** Null for the first line: the rate the shop JOINED with. */
  fromPct: number | null;
  toPct: number;
  at: number | null;
  /** Who moved it — null when the write carried no staff session. */
  actorId: string | null;
  actorEmail: string | null;
}

/** Postgres 42703 / 42P01 / PostgREST PGRST204 — the migration is not installed. */
const isMissing = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? ""));

export const COMMISSION_AUDIT_NOT_INSTALLED =
  "Commission history is not set up on this database yet — run supabase/migrations/202609290001_commission_audit.sql.";

const pct = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const at = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

interface DbCommissionRow {
  id: string | number;
  shop_id: string;
  created_at: string | null;
  old_pct: string | number | null;
  new_pct: string | number;
  actor_id: string | null;
  actor_email: string | null;
}

export const mapCommissionChange = (row: DbCommissionRow): CommissionChange => ({
  id: String(row.id),
  shopId: row.shop_id,
  fromPct: row.old_pct === null || row.old_pct === undefined ? null : pct(row.old_pct),
  toPct: pct(row.new_pct),
  at: at(row.created_at),
  actorId: row.actor_id ?? null,
  actorEmail: row.actor_email ?? null,
});

/**
 * The trail for one shop, oldest first — the order it happened in, so the
 * first line is always "the rate it joined with".
 */
export async function listCommissionHistory(
  db: SupabaseClient,
  shopId: string,
): Promise<CommissionChange[]> {
  if (!shopId) return [];
  const { data, error } = await db
    .from("shop_commission_history")
    .select("id,shop_id,created_at,old_pct,new_pct,actor_id,actor_email")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);
  if (error) {
    if (isMissing(error)) throw new AdminInputError(COMMISSION_AUDIT_NOT_INSTALLED, 503);
    throw new AdminInputError("Could not read this shop's commission history.", 500);
  }
  return ((data ?? []) as DbCommissionRow[]).map(mapCommissionChange);
}
