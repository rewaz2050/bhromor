/**
 * GET /api/account/me — session probe for the browser hook.
 * 200 {customer} · 401 no session · {demoMode:true} without Supabase keys.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const });
  }
  const customer = await resolveCustomer(request);
  if (!customer) return apiJson({ customer: null }, 401);
  return apiJson({ customer });
}
