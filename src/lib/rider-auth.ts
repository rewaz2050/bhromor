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

export class RiderAuthError extends Error {
  status: 401 | 403 | 503;
  constructor(message: string, status: 401 | 403 | 503) {
    super(message);
    this.status = status;
  }
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
  if (rowError || !row) {
    throw new RiderAuthError("This account has no rider access.", 403);
  }

  const rider = mapRider(row as DbRider);
  if (rider.status !== "active") {
    throw new RiderAuthError(
      "Your rider account is not active. Contact PROSANTI support.",
      403,
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
