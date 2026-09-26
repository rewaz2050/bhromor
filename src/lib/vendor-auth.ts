/**
 * Vendor gate for /api/vendor/* routes (marketplace phase 2, slice 3).
 *
 * Mirrors staff-auth.ts: verifies the Supabase session server-side, then
 * checks the `vendor_users` table. No session → 401; signed-in non-vendor →
 * 403; vendor of a non-active shop → 403 with a `reason` the login page can
 * show — `pending` while the application awaits approval (apply = sign up,
 * 2026-09-26), `suspended` once staff has flipped the status.
 */

import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServer } from "./supabase-server";

export type VendorRole = "owner" | "staff";

export interface VendorContext {
  user: User;
  shopId: string;
  role: VendorRole;
  /** RLS-bound client: vendor reads/writes flow through shop policies. */
  db: SupabaseClient;
}

/** Why a signed-in user is refused — drives the pending card on /vendor/login. */
export type VendorDenyReason = "none" | "pending" | "suspended";

export class VendorAuthError extends Error {
  status: 401 | 403;
  reason?: VendorDenyReason;
  constructor(message: string, status: 401 | 403, reason?: VendorDenyReason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export async function requireVendor(): Promise<VendorContext> {
  const db = await getSupabaseServer();
  if (!db) throw new VendorAuthError("Vendor sign-in is not configured.", 401);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new VendorAuthError("Please sign in again.", 401);
  }
  const { data: link, error: linkError } = await db
    .from("vendor_users")
    .select("shop_id,role")
    .eq("user_id", data.user.id)
    .single();
  if (linkError || !link) {
    throw new VendorAuthError("This account has no vendor access.", 403, "none");
  }
  const shopId = (link as { shop_id: string }).shop_id;
  const { data: shop } = await db
    .from("shops")
    .select("status")
    .eq("id", shopId)
    .single();
  const shopStatus = (shop as { status: string } | null)?.status;
  if (shopStatus === "pending") {
    throw new VendorAuthError(
      "Your shop application is awaiting PROSANTI's approval — this login opens the dashboard the moment it is confirmed.",
      403,
      "pending",
    );
  }
  if (shopStatus !== "active") {
    throw new VendorAuthError(
      "This shop is suspended — contact PROSANTI support.",
      403,
      "suspended",
    );
  }
  return {
    user: data.user,
    shopId,
    role: (link as { role: VendorRole }).role,
    db,
  };
}
