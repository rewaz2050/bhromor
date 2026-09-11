/**
 * GET /api/account/me — session probe for the browser hook.
 * 200 {customer} · 401 no session.
 */

import { resolveCustomer, customerStoreReady } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ customer: null }, 401);
  }
  const customer = await resolveCustomer(request);
  if (customer) return apiJson({ customer });
  // Signed-out probe: if the accounts store was never migrated, still answer
  // "signed out".
  const db = getSupabaseService();
  if (db && !(await customerStoreReady(db))) {
    console.warn(
      "[account/me] accounts store missing — apply supabase/migrations/202609110004_customer_accounts.sql",
    );
  }
  return apiJson({ customer: null }, 401);
}
