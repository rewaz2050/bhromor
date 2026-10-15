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

  // The first page is 20; "Load more" asks for the next step. The list caps
  // at 50 (listOrdersForPhone clamps), so a shopper with a long history still
  // gets the recent ones fast and the older ones on the tracker.
  const url = new URL(request.url);
  const asked = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 50) : 20;
  // Security 2026-10-14 (H5): history starts at account creation — claiming
  // a phone number without verification must not expose earlier guest orders.
  const orders = await listOrdersForPhone(db, customer.phone, limit, customer.createdAt ?? null);
  return apiJson({ orders, phone: customer.phone, limit });
}
