/**
 * Staff gate for /api/admin/* routes (blueprint §46–47).
 *
 * The browser holds a Supabase Auth session (cookie client); each admin
 * route calls `requireStaff()` which verifies the JWT server-side and then
 * checks the `admin_users` role table. Unauthenticated browsers have no
 * and get 401; signed-in non-staff get 403. Roles, not URLs, are the
 * boundary — hiding admin pages in the UI is convenience, this is the lock.
 *
 * The JWT may arrive as an Auth cookie (middleware) or as
 * `Authorization: Bearer <access_token>` from the staff UI. Either is
 * enough. Role lookup prefers the service-role client so RLS cannot hide
 * a real admin_users row from the gate itself.
 */

import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getSupabaseServer, getSupabaseService } from "./supabase-server";
import { supabaseAnonKey, supabaseUrl } from "./env";

export type StaffRole = "manager" | "admin" | "super_admin";

export interface StaffContext {
  user: User;
  role: StaffRole;
  /** RLS-bound client: staff reads/writes flow through database policies. */
  db: SupabaseClient;
}

export class StaffAuthError extends Error {
  status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.status = status;
  }
}

const STAFF_ROLES: readonly string[] = ["manager", "admin", "super_admin"];

export const readBearerToken = (authorization: string | null): string | null => {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  return match?.[1] ?? null;
};

const userFromBearer = async (token: string): Promise<{
  user: User;
  db: SupabaseClient;
} | null> => {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return null;
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, db };
};

/**
 * Verify the request's Supabase session and staff role.
 * Throws StaffAuthError(401) without a session, (403) without a staff row.
 */
const requestBearer = async (): Promise<string | null> => {
  try {
    const headerStore = await headers();
    return readBearerToken(headerStore.get("authorization"));
  } catch {
    return null;
  }
};

export async function requireStaff(): Promise<StaffContext> {
  const bearer = await requestBearer();
  const fromHeader = bearer ? await userFromBearer(bearer) : null;

  const db = fromHeader?.db ?? (await getSupabaseServer());
  let user = fromHeader?.user ?? null;

  if (!user) {
    if (!db) throw new StaffAuthError("Staff sign-in is not configured.", 401);
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) {
      throw new StaffAuthError("Please sign in again.", 401);
    }
    user = data.user;
  }
  if (!db) throw new StaffAuthError("Staff sign-in is not configured.", 401);

  const lookup = getSupabaseService() ?? db;
  const { data: row, error: roleError } = await lookup
    .from("admin_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (roleError) {
    const missing =
      roleError.code === "42P01" ||
      /does not exist/i.test(roleError.message) ||
      /schema cache/i.test(roleError.message);
    throw new StaffAuthError(
      missing
        ? "admin_users is missing. Run supabase/schema.sql in the SQL editor, then grant this email."
        : "This account is not staff.",
      403,
    );
  }
  if (!row || !STAFF_ROLES.includes((row as { role: string }).role)) {
    throw new StaffAuthError("This account is not staff.", 403);
  }
  return { user, role: (row as { role: StaffRole }).role, db };
}

/**
 * Verify the session AND that the role is one of the allowed ones.
 * Staff management (/api/admin/staff) requires admin/super_admin —
 * managers run daily ops but never hand out access.
 */
export async function requireStaffRole(
  ...allowed: StaffRole[]
): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (!allowed.includes(ctx.role)) {
    throw new StaffAuthError(
      "Admin access is required for this action.",
      403,
    );
  }
  return ctx;
}
