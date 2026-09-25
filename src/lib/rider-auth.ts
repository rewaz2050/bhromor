/**
 * Rider gate for /api/rider/* routes (marketplace phase 3, slice 7+).
 *
 * Mirrors vendor-auth.ts: verifies the Supabase session server-side, then
 * checks the `riders` link. No session → 401; signed-in non-rider → 403;
 * suspended/pending rider → 403. Data access flows server-side through this
 * gate so the rider never sees another rider's jobs or staff PII.
 *
 * Apply-before-signup auto-link (2026-09-25): /rider/apply accepts
 * anonymous applications (user_id NULL). When that applicant later signs up
 * with the SAME contact email, the first authenticated probe links the row
 * to their Auth id automatically — otherwise every such rider saw "This
 * account has no rider access" forever until staff pressed Link rider by
 * hand. The link is a single service-role UPDATE guarded by
 * `.is("user_id", null)` so two logins can never steal each other's row.
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

export class RiderAuthError extends Error {
  status: 401 | 403 | 503;
  code?: string;
  constructor(message: string, status: 401 | 403 | 503, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Link an anonymous application to the login that owns its contact email.
 * Returns the linked row, or null when there is nothing safe to link.
 * Suspended rows are never linked (a ban must stay a ban).
 */
export async function tryAutoLinkRider(
  service: SupabaseClient,
  userId: string,
  email: string,
): Promise<DbRider | null> {
  const clean = email.trim().toLowerCase();
  if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return null;
  const { data: candidate } = await service
    .from("riders")
    .select("*")
    .ilike("contact_email", clean)
    .is("user_id", null)
    .neq("status", "suspended")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;
  const row = candidate as DbRider;
  // Guarded re-check: only link while the row is still unclaimed.
  const { error: linkError } = await service
    .from("riders")
    .update({ user_id: userId })
    .eq("id", row.id)
    .is("user_id", null);
  if (linkError) return null;
  const { data: linked } = await service
    .from("riders")
    .select("*")
    .eq("id", row.id)
    .single();
  return (linked as DbRider | null) ?? null;
}

export async function requireRider(): Promise<RiderContext> {
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
  let riderRow = (rowError ? null : (row as DbRider | null)) ?? null;
  if (!riderRow) {
    // Applied before signing up? Link the anonymous application now.
    const service = getSupabaseService();
    const linked =
      service && data.user.email
        ? await tryAutoLinkRider(service, data.user.id, data.user.email)
        : null;
    if (linked) {
      riderRow = linked;
    } else {
      throw new RiderAuthError(
        "This account has no rider access.",
        403,
        "NO_RIDER",
      );
    }
  }

  const rider = mapRider(riderRow);
  if (rider.status !== "active") {
    const pending =
      rider.status === "pending"
        ? "Your rider application is still pending approval — we'll call you after verification."
        : "Your rider account is suspended. Contact PROSANTI support.";
    throw new RiderAuthError(
      pending,
      403,
      rider.status === "pending" ? "RIDER_PENDING" : "RIDER_SUSPENDED",
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
