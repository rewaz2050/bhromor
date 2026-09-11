/**
 * GET /api/account/me — session probe for the browser hook.
 * 200 {customer} · 401 no session · {demoMode:true} without Supabase keys
 * — or with an accounts store that was never migrated (42P01), so the
 * browser-local store can take over honestly instead of the hook being told
 * "live" with a dead signup form.
 */

import { resolveCustomer, customerStoreReady } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const });
  }
  const customer = await resolveCustomer(request);
  if (customer) return apiJson({ customer });
  // Signed-out probe: if the accounts store was never migrated, say demo —
  // the browser-local store then takes signup/login over honestly.
  const db = getSupabaseService();
  if (db && !(await customerStoreReady(db))) {
    console.warn(
      "[account/me] accounts store missing — apply supabase/migrations/202609110004_customer_accounts.sql",
    );
    return apiJson({ demoMode: true as const });
  }
  return apiJson({ customer: null }, 401);
}
