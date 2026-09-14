/**
 * PROSANTI+ membership — server-side data layer (P2 #17).
 *
 * The ledger is simple on purpose: one row per application, money checked by
 * a human against the shop's own wallet (the P1 #8 model, for the same
 * reason — there is no PSP here to trust instead). Approval stamps a 30-day
 * month × months term; renewal approval EXTENDS the phone's furthest expiry,
 * so stacking months never loses days. The free-delivery check inside
 * ps_place_order and the checkout snapshot read this same table — one answer,
 * three surfaces, no fork.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  membershipPhoneKey,
  membershipStateFor,
  plusAmountPaisa,
  sanitizePlus,
  type MembershipDisplayState,
  type PlusConfig,
} from "../membership";
import { notifyStaff, readOpsSettings } from "./engagement";
import { AdminInputError } from "./admin";

export interface MembershipRow {
  id: string;
  phone: string;
  name: string;
  status: "pending" | "active" | "rejected";
  months: number;
  amountPaisa: number;
  payMethod: string | null;
  trxid: string | null;
  note: string;
  createdAt: number;
  decidedAt: number | null;
  startedAt: number | null;
  expiresAt: number | null;
}

interface DbMembership {
  id: string;
  phone: string;
  name: string;
  status: "pending" | "active" | "rejected";
  months: number;
  amount_paisa: number;
  pay_method: string | null;
  trxid: string | null;
  note: string;
  created_at: string;
  decided_at: string | null;
  started_at: string | null;
  expires_at: string | null;
}

const epoch = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

const mapRow = (r: DbMembership): MembershipRow => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  status: r.status,
  months: r.months,
  amountPaisa: r.amount_paisa,
  payMethod: r.pay_method,
  trxid: r.trxid,
  note: r.note ?? "",
  createdAt: epoch(r.created_at) ?? 0,
  decidedAt: epoch(r.decided_at),
  startedAt: epoch(r.started_at),
  expiresAt: epoch(r.expires_at),
});

/** Is this phone a live member right now? (checkout mirror of the RPC) */
export async function isPlusMember(db: SupabaseClient, rawPhone: unknown): Promise<boolean> {
  const phone = membershipPhoneKey(rawPhone);
  if (phone === null) return false;
  const now = Date.now();
  const { data, error } = await db
    .from("memberships")
    .select("status, expires_at")
    .eq("phone", phone)
    .eq("status", "active");
  if (error || !data) return false;
  return (data as { status: string; expires_at: string | null }[]).some(
    (r) => r.expires_at !== null && Date.parse(r.expires_at) > now,
  );
}

/** Public status shape — no names, no phones, no history. */
export async function membershipStatusFor(
  db: SupabaseClient,
  rawPhone: unknown,
): Promise<{ state: MembershipDisplayState; expiresAt: number | null }> {
  const phone = membershipPhoneKey(rawPhone);
  const empty = { state: "none" as const, expiresAt: null };
  if (phone === null) return empty;
  const { data, error } = await db
    .from("memberships")
    .select("status, expires_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return empty;
  const rows = (data as { status: string; expires_at: string | null }[]).map((r) => ({
    phone,
    status: (r.status === "active" || r.status === "rejected" ? r.status : "pending") as
      | "active"
      | "pending"
      | "rejected",
    expiresAt: r.expires_at ? Date.parse(r.expires_at) : null,
  }));
  return membershipStateFor(rows);
}

/** Apply — money already sent; staff verify against the wallet. */
export async function applyMembership(
  db: SupabaseClient,
  raw: unknown,
): Promise<{ ok: true; state: "pending" | "active" | "rejected"; message: string }> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const settings = await readOpsSettings(db);
  const plus = sanitizePlus(settings.plus);
  if (!plus.enabled) {
    throw new AdminInputError(
      "PROSANTI+ is not being enrolled right now — please check back soon.",
      503,
    );
  }
  const phone = membershipPhoneKey(body.phone);
  if (phone === null) throw new AdminInputError("Enter a valid Bangladeshi mobile number.", 422);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name.length < 2) throw new AdminInputError("Share the name the booking is under.", 422);
  const months = Math.max(1, Math.min(12, Math.floor(Number(body.months) || 1)));
  const payMethod = body.payMethod === "nagad" ? "nagad" : body.payMethod === "bkash" ? "bkash" : "";
  if (payMethod === "") throw new AdminInputError("Choose bKash or Nagad.", 422);
  const walletConfigured = (settings.wallets as Record<string, string>)[payMethod] ?? "";
  if (walletConfigured === "") {
    throw new AdminInputError(`The shop has not configured a ${payMethod} number — try the other or pay on delivery.`, 422);
  }
  const trxid =
    typeof body.trxid === "string" ? trxidShape(body.trxid) : null;
  if (trxid === null) {
    throw new AdminInputError("Enter the TRXID from your wallet transfer.", 422);
  }
  const amountPaisa = plusAmountPaisa(plus, months);

  const { data: dupes } = await db
    .from("memberships")
    .select("id,status")
    .eq("phone", phone)
    .eq("status", "pending")
    .limit(1);
  if (dupes && dupes.length > 0) {
    return { ok: true, state: "pending", message: "Your application is already with the shop — one at a time!" };
  }
  const { error } = await db.from("memberships").insert({
    phone,
    name,
    status: "pending",
    months,
    amount_paisa: amountPaisa,
    pay_method: payMethod,
    trxid,
    note: "",
  });
  if (error) throw new AdminInputError("Could not record the application — please try again.", 503);

  await notifyStaff(db, {
    kind: "system",
    title: "PROSANTI+ — membership application",
    body: `${name} · ${phone} · ${(amountPaisa / 100).toLocaleString("en-IN")}৳ via ${payMethod} · TRXID ${trxid} — check the wallet, then approve.`,
    href: "/admin/growth",
  });
  return { ok: true, state: "pending", message: "Sent! The shop checks wallet transfers and activates within a few hours." };
}

/** TRXIDs are 6–32 alphanumerics — same shape rule as the order payments. */
const trxidShape = (raw: string): string | null => {
  const t = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,32}$/.test(t) ? t : null;
};

/** Staff lists applications (newest first, statuses mixed). */
export async function listMembershipRequests(db: SupabaseClient): Promise<MembershipRow[]> {
  const { data, error } = await db
    .from("memberships")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return (data as DbMembership[]).map(mapRow);
}

/** Approve: stamp a term that EXTENDS the phone's furthest expiry (renewal-safe). */
export async function approveMembership(
  db: SupabaseClient,
  id: string,
  note = "",
): Promise<MembershipRow> {
  const { data: row, error } = await db
    .from("memberships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) throw new AdminInputError("Application not found.", 404);
  const r = row as DbMembership;
  if (r.status !== "pending") throw new AdminInputError("Already decided.", 409);

  const nowMs = Date.now();
  let baseMs = nowMs;
  const { data: others } = await db
    .from("memberships")
    .select("expires_at")
    .eq("phone", r.phone)
    .eq("status", "active")
    .gt("expires_at", new Date(nowMs).toISOString());
  for (const o of (others ?? []) as { expires_at: string | null }[]) {
    const ms = o.expires_at ? Date.parse(o.expires_at) : NaN;
    if (Number.isFinite(ms) && ms > baseMs) baseMs = ms;
  }
  const expiresAt = new Date(baseMs + r.months * 30 * 86_400_000).toISOString();
  const { data: updated, error: updErr } = await db
    .from("memberships")
    .update({
      status: "active",
      decided_at: new Date(nowMs).toISOString(),
      started_at: new Date(nowMs).toISOString(),
      expires_at: expiresAt,
      note: typeof note === "string" ? note.trim().slice(0, 240) : r.note,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr || !updated) throw new AdminInputError("Approval failed — try again.", 503);
  return mapRow(updated as DbMembership);
}

/** Reject with a reason the applicant can read on their account page. */
export async function rejectMembership(
  db: SupabaseClient,
  id: string,
  note: string,
): Promise<MembershipRow> {
  const clean = typeof note === "string" ? note.trim().slice(0, 240) : "";
  const { data, error } = await db
    .from("memberships")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      note: clean === "" ? "No matching wallet transfer was found for that TRXID." : clean,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AdminInputError("Already decided or not found.", 409);
  return mapRow(data as DbMembership);
}

export type { PlusConfig };
