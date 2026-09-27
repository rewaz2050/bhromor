/**
 * Rider gate for /api/rider/* routes (marketplace phase 3, slice 7+).
 *
 * Mirrors vendor-auth.ts: verifies the Supabase session server-side, then
 * checks the `riders` link. No session → 401; signed-in non-rider → 403;
 * suspended/pending rider → 403. Data access flows server-side through this
 * gate so the rider never sees another rider's jobs or staff PII.
 */

import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServer, getSupabaseService } from "./supabase-server";
import { mapRider } from "./db/mappers";
import type { DbRider } from "./db/types";
import type { Rider } from "./catalog";

export interface RiderContext {
  user: User;
  /** Public rider shape (never includes login email beyond self). */
  rider: Rider;
  /** RLS-bound request client: state-change RPCs read auth.uid() from it. */
  db: SupabaseClient;
  /** Service-role client for job reads that batch order snapshots. */
  service: SupabaseClient;
  email: string;
}

/** Why a signed-in user is refused — drives the status card on /rider/login. */
export type RiderDenyReason = "none" | "pending" | "suspended" | "rejected";

export class RiderAuthError extends Error {
  status: 401 | 403 | 503;
  reason?: RiderDenyReason;
  constructor(message: string, status: 401 | 403 | 503, reason?: RiderDenyReason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export interface RequireRiderOptions {
  /**
   * Round 4 — let a rider whose application is still `pending` (or was
   * `rejected` and is being fixed) through. Only the KYC upload routes use
   * this; every job/cash route keeps the active-only gate.
   */
  allowApplicant?: boolean;
}

/** Bangla message for a rejected application, note included when staff left one. */
export const riderRejectedMessage = (note?: string): string =>
  note && note.trim() !== ""
    ? `আপনার রাইডার আবেদনটি এবার অনুমোদন হয়নি। কারণ: ${note.trim()} — তথ্য ঠিক করে একই লগইনে আবার আবেদন করুন।`
    : "আপনার রাইডার আবেদনটি এবার অনুমোদন হয়নি — তথ্য ঠিক করে একই লগইনে আবার আবেদন করুন, অথবা PROSANTI সাপোর্টে কথা বলুন।";

export async function requireRider(
  opts: RequireRiderOptions = {},
): Promise<RiderContext> {
  const server = await getSupabaseServer();
  if (!server) {
    throw new RiderAuthError("Rider sign-in is not configured.", 401);
  }
  const { data, error } = await server.auth.getUser();
  if (error || !data.user) {
    throw new RiderAuthError("Please sign in again.", 401);
  }

  const { data: row, error: rowError } = await server
    .from("riders")
    .select("*")
    .eq("user_id", data.user.id)
    .single();
  if (rowError || !row) {
    throw new RiderAuthError("This account has no rider access.", 403, "none");
  }

  const rider = mapRider(row as DbRider);
  // Apply = sign up (2026-09-26): the login exists from the application on;
  // the status is the only gate, so say which one it is.
  const applicant = rider.status === "pending" || rider.status === "rejected";
  if (rider.status === "pending" && !opts.allowApplicant) {
    throw new RiderAuthError(
      "আপনার রাইডার আবেদন এখনো অনুমোদনের অপেক্ষায় আছে — অ্যাডমিন অনুমোদন করলেই এই লগইনে রাইডার অ্যাপ খুলবে।",
      403,
      "pending",
    );
  }
  if (rider.status === "rejected" && !opts.allowApplicant) {
    throw new RiderAuthError(riderRejectedMessage(rider.review?.note), 403, "rejected");
  }
  if (rider.status !== "active" && !applicant) {
    throw new RiderAuthError(
      "আপনার রাইডার অ্যাকাউন্টটি সাসপেন্ড করা আছে — PROSANTI সাপোর্টে যোগাযোগ করুন।",
      403,
      "suspended",
    );
  }

  const service = getSupabaseService();
  if (!service) {
    throw new RiderAuthError("Rider service is not configured.", 503);
  }

  return {
    user: data.user,
    rider,
    db: server,
    service,
    email: data.user.email ?? "",
  };
}
