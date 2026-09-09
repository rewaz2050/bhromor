/**
 * Staff gate for /api/admin/* routes (blueprint §46–47).
 *
 * The browser holds a Supabase Auth session (cookie client); each admin
 * route calls `requireStaff()` which verifies the JWT server-side and then
 * checks the `admin_users` role table. Demo-mode browsers have no session
 * and get 401; signed-in non-staff get 403. Roles, not URLs, are the
 * boundary — hiding admin pages in the UI is convenience, this is the lock.
 */

import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServer } from "./supabase-server";

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

/**
 * Verify the request's Supabase session and staff role.
 * Throws StaffAuthError(401) without a session, (403) without a staff row.
 */
export async function requireStaff(): Promise<StaffContext> {
  const db = await getSupabaseServer();
  if (!db) throw new StaffAuthError("Staff sign-in is not configured.", 401);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new StaffAuthError("Please sign in again.", 401);
  }
  const { data: row, error: roleError } = await db
    .from("admin_users")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (roleError || !row || !STAFF_ROLES.includes((row as { role: string }).role)) {
    throw new StaffAuthError("This account is not staff.", 403);
  }
  return { user: data.user, role: (row as { role: StaffRole }).role, db };
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
