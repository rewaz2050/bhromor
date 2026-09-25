/**
 * GET /api/account/me — session probe for the browser hook.
 * 200 {customer} · 401 no session.
 */

import {
  resolveCustomer,
  customerStoreReady,
  checkCustomerName,
  CustomerAuthError,
} from "@/lib/customer-auth";
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

/** PATCH /api/account/me { name } — edit the signed-in customer's profile. */
export async function PATCH(request: Request) {
  if (!isServiceRoleConfigured()) return apiJson({ error: "Not configured." }, 503);
  const customer = await resolveCustomer(request);
  if (!customer) return apiJson({ error: "আবার লগ ইন করুন।" }, 401);
  const db = getSupabaseService();
  if (!db) return apiJson({ error: "Not configured." }, 503);

  try {
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = checkCustomerName(body?.name);
    const { data, error } = await db
      .from("customers")
      .update({ name })
      .eq("id", customer.id)
      .select("id, name, phone")
      .single();
    if (error || !data) return apiJson({ error: "প্রোফাইল সেভ করা যায়নি — আবার চেষ্টা করুন।" }, 500);
    return apiJson({ customer: data });
  } catch (err) {
    if (err instanceof CustomerAuthError) return apiJson({ error: err.message }, err.status);
    return apiJson({ error: "প্রোফাইল সেভ করা যায়নি।" }, 500);
  }
}
