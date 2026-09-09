/**
 * Vendor gate for /api/vendor/* routes (marketplace phase 2, slice 3).
 *
 * Mirrors staff-auth.ts: verifies the Supabase session server-side, then
 * checks the `vendor_users` table. No session → 401; signed-in non-vendor →
 * 403; vendor of a non-active shop → 403 (suspended shops lose API access
 * the moment staff flips the status).
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

export class VendorAuthError extends Error {
  status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.status = status;
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
    throw new VendorAuthError("This account has no vendor access.", 403);
  }
  const shopId = (link as { shop_id: string }).shop_id;
  const { data: shop } = await db
    .from("shops")
    .select("status")
    .eq("id", shopId)
    .single();
  if ((shop as { status: string } | null)?.status !== "active") {
    throw new VendorAuthError(
      "This shop is not active — contact PROSANTI support.",
      403,
    );
  }
  return {
    user: data.user,
    shopId,
    role: (link as { role: VendorRole }).role,
    db,
  };
}
