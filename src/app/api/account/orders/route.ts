/**
 * GET /api/account/orders — the signed-in customer's order history
 * (UX audit 2026-09-18, P1 #15). Scoped to the ACCOUNT phone (the session
 * proves it), newest first, 20 rows. Each row links to /track with the
 * account phone, where the full timeline, cancel and returns live.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { listOrdersForPhone } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ error: "Not configured." }, 503);
  }
  const customer = await resolveCustomer(request);
  if (!customer) return apiJson({ error: "Sign in first." }, 401);
  const db = getSupabaseService();
  if (!db) return apiJson({ error: "Not configured." }, 503);

  const orders = await listOrdersForPhone(db, customer.phone, 20);
  return apiJson({ orders, phone: customer.phone });
}
