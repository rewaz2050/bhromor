import "server-only";

/**
 * Password reset REQUESTS for vendor / rider logins (2026-09-26).
 *
 * There is no e-mail or SMS in this onboarding, so a forgotten password is
 * not a reset link — it is a request:
 *
 *   1. the person files it from the login page with the email + phone that
 *      are on their shop / rider row (`createResetRequest`);
 *   2. staff see it in Admin → Access, call the number on file, and approve
 *      (or reject with a note) — `decideResetRequest`;
 *   3. approval opens a 24-hour window in which the SAME email + phone pair
 *      may set a new password once (`completeResetRequest`); the login page
 *      polls `resetRequestStatus` and shows the form by itself.
 *
 * Nothing secret is generated or transported. Identity is the email + phone
 * pair (what the requester already knew), the staff phone call, and the
 * window. Rows are written with the service role; staff read/decide through
 * RLS (`password_reset_requests staff all`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlausibleBdPhone, normalizeBdPhone } from "../phone";
import { setApplicantPassword } from "./applicant-account";

export type ResetKind = "vendor" | "rider";
export type ResetStatus = "pending" | "approved" | "rejected" | "used" | "expired";
/** What the login page sees: the row status, or `none` when nothing is open. */
export type PublicResetStatus = ResetStatus | "none";

/** How long an approval stays usable. */
export const RESET_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export class ResetRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ResetRequestRow {
  id: string;
  kind: ResetKind;
  user_id: string;
  subject_id: string;
  subject_name: string;
  email: string;
  phone: string;
  status: ResetStatus;
  note: string | null;
  requested_at: string;
  requested_ip: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  expires_at: string | null;
  used_at: string | null;
}

export interface ResetRequestPublic {
  status: PublicResetStatus;
  requestedAt: string | null;
  expiresAt: string | null;
  /** Staff note — only on a rejection. */
  note: string | null;
}

export interface AdminResetRequest {
  id: string;
  kind: ResetKind;
  subjectId: string;
  subjectName: string;
  email: string;
  phone: string;
  status: ResetStatus;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
}

const SELECT =
  "id,kind,user_id,subject_id,subject_name,email,phone,status,note,requested_at,requested_ip,reviewed_at,reviewed_by,expires_at,used_at";

/* ------------------------------------------------------------------ */
/* Input normalisation                                                 */
/* ------------------------------------------------------------------ */

export const normalizeResetEmail = (raw: unknown): string => {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new ResetRequestError("সঠিক ইমেইল অ্যাড্রেস দিন।", 400);
  }
  return email;
};

export const normalizeResetPhone = (raw: unknown): string => {
  const phone = typeof raw === "string" ? normalizeBdPhone(raw) : "";
  if (!isPlausibleBdPhone(phone)) {
    throw new ResetRequestError("আবেদনে দেওয়া বাংলাদেশি মোবাইল নম্বরটি দিন (যেমন: 017XXXXXXXX)।", 400);
  }
  return phone;
};

export const parseResetKind = (raw: unknown): ResetKind => {
  if (raw === "vendor" || raw === "rider") return raw;
  throw new ResetRequestError("Unknown login kind.", 400);
};

/** `ilike` treats `%` and `_` as wildcards — an email may contain `_`. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * An approved row is only usable until `expires_at`; the column is not
 * rewritten by a cron, so callers derive the effective status here.
 */
export const effectiveStatus = (
  row: Pick<ResetRequestRow, "status" | "expires_at">,
  now: number = Date.now(),
): ResetStatus => {
  if (row.status === "approved" && row.expires_at && Date.parse(row.expires_at) <= now) {
    return "expired";
  }
  return row.status;
};

export const toAdminResetRequest = (row: ResetRequestRow, now: number = Date.now()): AdminResetRequest => ({
  id: row.id,
  kind: row.kind,
  subjectId: row.subject_id,
  subjectName: row.subject_name,
  email: row.email,
  phone: row.phone,
  status: effectiveStatus(row, now),
  note: row.note,
  requestedAt: row.requested_at,
  reviewedAt: row.reviewed_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
});

const toPublic = (row: ResetRequestRow | null, now: number = Date.now()): ResetRequestPublic => {
  if (!row) return { status: "none", requestedAt: null, expiresAt: null, note: null };
  const status = effectiveStatus(row, now);
  return {
    status,
    requestedAt: row.requested_at,
    expiresAt: status === "approved" ? row.expires_at : null,
    note: status === "rejected" ? row.note : null,
  };
};

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

/** False until migration 202609260001 has been applied. */
export const resetRequestsReady = async (service: SupabaseClient): Promise<boolean> => {
  const { error } = await service
    .from("password_reset_requests")
    .select("id", { head: true, count: "exact" });
  return !error;
};

/* ------------------------------------------------------------------ */
/* Who is asking                                                       */
/* ------------------------------------------------------------------ */

export interface ResetSubject {
  userId: string;
  subjectId: string;
  name: string;
}

/**
 * Resolve the login behind an email + phone pair: the shop (owner link) or
 * rider row whose contact email matches and whose phone normalizes to the
 * same number. Null when nothing matches or the row has no login yet.
 */
export async function findResetSubject(
  service: SupabaseClient,
  kind: ResetKind,
  email: string,
  phone: string,
): Promise<ResetSubject | null> {
  if (kind === "rider") {
    const { data } = await service
      .from("riders")
      .select("id,name,phone,user_id")
      .ilike("contact_email", escapeLike(email))
      .limit(10);
    const rows = (data ?? []) as { id: string; name: string; phone: string; user_id: string | null }[];
    const match = rows.find((r) => normalizeBdPhone(r.phone ?? "") === phone && r.user_id);
    return match && match.user_id ? { userId: match.user_id, subjectId: match.id, name: match.name } : null;
  }
  const { data } = await service
    .from("shops")
    .select("id,name,phone")
    .ilike("contact_email", escapeLike(email))
    .limit(10);
  const rows = (data ?? []) as { id: string; name: string; phone: string }[];
  const shop = rows.find((r) => normalizeBdPhone(r.phone ?? "") === phone);
  if (!shop) return null;
  const { data: owner } = await service
    .from("vendor_users")
    .select("user_id")
    .eq("shop_id", shop.id)
    .eq("role", "owner")
    .limit(1);
  const userId = (owner as { user_id: string }[] | null)?.[0]?.user_id;
  return userId ? { userId, subjectId: shop.id, name: shop.name } : null;
}

const openRequestFor = async (
  service: SupabaseClient,
  userId: string,
): Promise<ResetRequestRow | null> => {
  const { data } = await service
    .from("password_reset_requests")
    .select(SELECT)
    .eq("user_id", userId)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1);
  return ((data ?? []) as ResetRequestRow[])[0] ?? null;
};

/** Mark an approved-but-lapsed row so a fresh request can be filed. */
const retireIfExpired = async (
  service: SupabaseClient,
  row: ResetRequestRow | null,
  now: number,
): Promise<ResetRequestRow | null> => {
  if (!row || effectiveStatus(row, now) !== "expired") return row;
  await service
    .from("password_reset_requests")
    .update({ status: "expired" })
    .eq("id", row.id)
    .eq("status", "approved");
  return null;
};

/* ------------------------------------------------------------------ */
/* Public flow                                                         */
/* ------------------------------------------------------------------ */

/**
 * File a request. Idempotent: an open request for the same login is
 * returned instead of duplicated, so reloads and double taps are harmless.
 */
export async function createResetRequest(
  service: SupabaseClient,
  input: { kind: ResetKind; email: string; phone: string; ip?: string | null },
  now: number = Date.now(),
): Promise<{ request: ResetRequestPublic; subject: ResetSubject; created: boolean }> {
  const subject = await findResetSubject(service, input.kind, input.email, input.phone);
  if (!subject) {
    throw new ResetRequestError(
      input.kind === "vendor"
        ? "এই ইমেইল ও ফোন নম্বরের কোনো দোকান লগইন পাওয়া যায়নি — আবেদনের সময় যেটা দিয়েছিলেন সেটাই দিন, অথবা সাপোর্টে জানান।"
        : "এই ইমেইল ও ফোন নম্বরের কোনো রাইডার লগইন পাওয়া যায়নি — আবেদনের সময় যেটা দিয়েছিলেন সেটাই দিন, অথবা সাপোর্টে জানান।",
      404,
    );
  }
  const existing = await retireIfExpired(service, await openRequestFor(service, subject.userId), now);
  if (existing) return { request: toPublic(existing, now), subject, created: false };

  const { data, error } = await service
    .from("password_reset_requests")
    .insert({
      kind: input.kind,
      user_id: subject.userId,
      subject_id: subject.subjectId,
      subject_name: subject.name.slice(0, 120),
      email: input.email,
      phone: input.phone,
      requested_ip: input.ip ?? null,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    // Unique-index race: someone filed it a moment ago — answer that one.
    const raced = await openRequestFor(service, subject.userId);
    if (raced) return { request: toPublic(raced, now), subject, created: false };
    throw new Error(`reset request insert failed: ${error?.message ?? "no row"}`);
  }
  return { request: toPublic(data as ResetRequestRow, now), subject, created: true };
}

/** What the login page polls: the latest request for this email + phone. */
export async function resetRequestStatus(
  service: SupabaseClient,
  input: { kind: ResetKind; email: string; phone: string },
  now: number = Date.now(),
): Promise<ResetRequestPublic> {
  const { data } = await service
    .from("password_reset_requests")
    .select(SELECT)
    .eq("kind", input.kind)
    .eq("email", input.email)
    .eq("phone", input.phone)
    .order("requested_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as ResetRequestRow[])[0] ?? null;
  return toPublic(row, now);
}

/**
 * Set the new password inside an approved window, then close the request.
 * The pair must match the approved row exactly — the same proof the request
 * was filed with.
 */
export async function completeResetRequest(
  service: SupabaseClient,
  input: { kind: ResetKind; email: string; phone: string; password: string },
  now: number = Date.now(),
): Promise<void> {
  const { data } = await service
    .from("password_reset_requests")
    .select(SELECT)
    .eq("kind", input.kind)
    .eq("email", input.email)
    .eq("phone", input.phone)
    .eq("status", "approved")
    .order("requested_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as ResetRequestRow[])[0] ?? null;
  if (!row) {
    throw new ResetRequestError(
      "এই অনুরোধ এখনো অনুমোদিত হয়নি বা আগেই ব্যবহার হয়ে গেছে — লগইন পেইজ থেকে অবস্থা দেখুন।",
      409,
    );
  }
  if (effectiveStatus(row, now) === "expired") {
    await retireIfExpired(service, row, now);
    throw new ResetRequestError(
      "অনুমোদনের ২৪ ঘণ্টা পেরিয়ে গেছে — আবার অনুরোধ করুন।",
      410,
    );
  }
  await setApplicantPassword(service, row.user_id, input.password);
  await service
    .from("password_reset_requests")
    .update({ status: "used", used_at: new Date(now).toISOString() })
    .eq("id", row.id)
    .eq("status", "approved");
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

/** Pending first (oldest at top), then the most recent decided rows. */
export async function listResetRequests(
  db: SupabaseClient,
  now: number = Date.now(),
): Promise<{ pending: AdminResetRequest[]; recent: AdminResetRequest[] }> {
  const [pendingRes, recentRes] = await Promise.all([
    db
      .from("password_reset_requests")
      .select(SELECT)
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(100),
    db
      .from("password_reset_requests")
      .select(SELECT)
      .neq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(30),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);
  return {
    pending: ((pendingRes.data ?? []) as ResetRequestRow[]).map((r) => toAdminResetRequest(r, now)),
    recent: ((recentRes.data ?? []) as ResetRequestRow[]).map((r) => toAdminResetRequest(r, now)),
  };
}

export async function countPendingResetRequests(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("password_reset_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return error ? 0 : (count ?? 0);
}

/**
 * Approve (opens the 24 h window) or reject (with an optional note the
 * requester sees on the login page). Only a pending row can be decided.
 */
export async function decideResetRequest(
  db: SupabaseClient,
  input: { id: string; action: "approve" | "reject"; note?: string | null; staffId: string },
  now: number = Date.now(),
): Promise<AdminResetRequest> {
  const note = (input.note ?? "").trim().slice(0, 300) || null;
  const patch =
    input.action === "approve"
      ? {
          status: "approved",
          reviewed_at: new Date(now).toISOString(),
          reviewed_by: input.staffId,
          expires_at: new Date(now + RESET_APPROVAL_WINDOW_MS).toISOString(),
          note: null,
        }
      : {
          status: "rejected",
          reviewed_at: new Date(now).toISOString(),
          reviewed_by: input.staffId,
          note,
        };
  const { data, error } = await db
    .from("password_reset_requests")
    .update(patch)
    .eq("id", input.id)
    .eq("status", "pending")
    .select(SELECT);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as ResetRequestRow[])[0];
  if (!row) throw new ResetRequestError("This request was already decided.", 409);
  return toAdminResetRequest(row, now);
}
