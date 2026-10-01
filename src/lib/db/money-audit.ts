import "server-only";

/**
 * Money audit trail reader (202610010006, audit item T). Read through the
 * staff JWT client: the table's RLS policy answers only to `ps_is_admin()`.
 * Returns null on a database where the migration has not run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";
import type { AuditEvent, MoneyAuditEntry } from "../money-audit";

interface Row {
  id: string;
  at: string;
  actor_id: string | null;
  actor_email: string | null;
  event: string;
  subject_type: string;
  subject_id: string | null;
  amount: number | string | null;
  detail: Record<string, unknown> | null;
}

export const listMoneyAudit = async (
  staffDb: SupabaseClient,
  opts: { event?: AuditEvent | null; limit: number },
): Promise<MoneyAuditEntry[] | null> => {
  let query = staffDb
    .from("money_audit_log")
    .select("id, at, actor_id, actor_email, event, subject_type, subject_id, amount, detail")
    .order("at", { ascending: false })
    .limit(opts.limit);
  if (opts.event) query = query.eq("event", opts.event);
  const { data, error } = await query;
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("money audit read failed");
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    at: Date.parse(r.at) || 0,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    event: r.event,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    amount: r.amount == null ? null : Number(r.amount),
    detail: r.detail ?? {},
  }));
};
