/**
 * Item W — rider disputes + manual adjustments (migration 202610020007).
 * The rider's RPC runs on their own JWT client (auth.uid() → rider); staff RPCs
 * run on the staff member's client so the audit trail names the real person.
 * Readers tolerate a database without the migration.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { isMissingDbObject, RiderInputError } from "./riders";
import type { AdminDispute, AdjustInput, RaiseInput, ResolveInput, RiderDispute } from "@/lib/rider-disputes";

interface DbDispute {
  id: string;
  rider_id: string;
  category: string;
  message: string;
  claimed_amount: number | string | null;
  status: "pending" | "approved" | "rejected";
  adjustment_amount: number | string | null;
  note: string | null;
  created_at: string;
  decided_at: string | null;
  riders?: { name?: string | null } | { name?: string | null }[] | null;
  orders?: { order_no?: string | null } | { order_no?: string | null }[] | null;
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const mapDispute = (row: DbDispute): RiderDispute => ({
  id: row.id,
  category: row.category,
  message: row.message,
  orderNo: one(row.orders)?.order_no ?? null,
  claimedAmount: row.claimed_amount == null ? null : Number(row.claimed_amount),
  status: row.status,
  adjustmentAmount: Number(row.adjustment_amount ?? 0),
  note: row.note,
  at: ms(row.created_at) ?? 0,
  decidedAt: ms(row.decided_at),
});

const SELECT = "id, rider_id, category, message, claimed_amount, status, adjustment_amount, note, created_at, decided_at, riders(name), orders(order_no)";

export const NOT_READY_RIDER = "অভিযোগের সুবিধা এখনো চালু হয়নি — অ্যাডমিনকে জানান।";

/** [] when the table is missing — the rider page simply shows no list. */
export const listRiderDisputes = async (service: SupabaseClient, riderId: string): Promise<{ ready: boolean; items: RiderDispute[] }> => {
  const { data, error } = await service
    .from("rider_disputes")
    .select(SELECT)
    .eq("rider_id", riderId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (isMissingDbObject(error)) return { ready: false, items: [] };
    throw new Error("disputes read failed");
  }
  return { ready: true, items: ((data ?? []) as unknown as DbDispute[]).map(mapDispute) };
};

export const raiseRiderDispute = async (db: SupabaseClient, input: RaiseInput): Promise<RiderDispute> => {
  const { data, error } = await db.rpc("ps_rider_raise_dispute", {
    p_assignment_id: input.assignmentId,
    p_category: input.category,
    p_message: input.message,
    p_claimed: input.claimed,
  });
  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (isMissingDbObject(error)) throw new RiderInputError(NOT_READY_RIDER, 503);
    if (m.includes("not your trip")) throw new RiderInputError("এই ট্রিপটি আপনার নয়।", 403);
    if (m.includes("already open")) throw new RiderInputError("এই ট্রিপ নিয়ে আপনার একটি অভিযোগ আগে থেকেই অপেক্ষায় আছে।", 409);
    if (m.includes("too many open")) throw new RiderInputError("আপনার ৫টি অভিযোগ এখনো অপেক্ষায় — সেগুলো নিষ্পত্তি হলে নতুন করুন।", 409);
    if (m.includes("rider not active")) throw new RiderInputError("আপনার অ্যাকাউন্ট এখন সক্রিয় নয়।", 403);
    if (m.includes("trip required")) throw new RiderInputError("কোন ট্রিপ নিয়ে সমস্যা, সেটি বেছে নিন।", 422);
    if (m.includes("too short") || m.includes("too long") || m.includes("invalid amount") || m.includes("unknown category")) {
      throw new RiderInputError("তথ্য সঠিক নয় — আবার দেখে পাঠান।", 422);
    }
    throw new RiderInputError("অভিযোগ জমা হয়নি — আবার চেষ্টা করুন।", 422);
  }
  const row = data as DbDispute;
  return mapDispute({ ...row, orders: null, riders: null });
};

/** null = migration not run. Staff read through RLS ("disputes admin read"). */
export const listDisputesForStaff = async (
  db: SupabaseClient,
  status: "pending" | "decided",
): Promise<AdminDispute[] | null> => {
  let query = db.from("rider_disputes").select(SELECT).order("created_at", { ascending: false }).limit(100);
  query = status === "pending" ? query.eq("status", "pending") : query.neq("status", "pending");
  const { data, error } = await query;
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("disputes read failed");
  }
  return ((data ?? []) as unknown as DbDispute[]).map((row) => ({
    ...mapDispute(row),
    riderId: row.rider_id,
    riderName: one(row.riders)?.name ?? "",
  }));
};

const adminMessage = (error: { message?: string; code?: string }): AdminInputError => {
  const m = (error.message ?? "").toLowerCase();
  if (isMissingDbObject(error)) {
    return new AdminInputError("Disputes aren't switched on yet — run migration 202610020007 in the Supabase SQL Editor.", 503);
  }
  if (m.includes("forbidden")) return new AdminInputError("Staff only.", 403);
  if (m.includes("dispute not found") || m.includes("rider not found")) return new AdminInputError("Not found.", 404);
  if (m.includes("already")) return new AdminInputError("This dispute was already decided.", 409);
  if (m.includes("negative")) return new AdminInputError("That debit is bigger than the rider's wallet balance.", 422);
  if (m.includes("too large")) return new AdminInputError("One adjustment can be at most ৳50,000.", 422);
  if (m.includes("reason required")) return new AdminInputError("A reason is required.", 422);
  if (m.includes("must not be zero")) return new AdminInputError("The amount must not be zero.", 422);
  return new AdminInputError("Could not save — try again.", 422);
};

export const resolveDispute = async (db: SupabaseClient, id: string, input: ResolveInput): Promise<AdminDispute> => {
  const { data, error } = await db.rpc("ps_admin_resolve_dispute", {
    p_id: id,
    p_decision: input.decision,
    p_amount: input.amount,
    p_note: input.note || null,
  });
  if (error) throw adminMessage(error);
  const row = data as DbDispute;
  return { ...mapDispute({ ...row, orders: null, riders: null }), riderId: row.rider_id, riderName: "" };
};

export const adjustRiderWallet = async (db: SupabaseClient, riderId: string, input: AdjustInput): Promise<{ id: string; amount: number }> => {
  const { data, error } = await db.rpc("ps_admin_adjust_rider", {
    p_rider_id: riderId,
    p_amount: input.amount,
    p_note: input.note,
  });
  if (error) throw adminMessage(error);
  const row = data as { id: string; amount: number | string };
  return { id: row.id, amount: Number(row.amount) };
};
