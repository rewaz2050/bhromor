/**
 * GET /api/account/card — the signed-in customer's Smart Card (stamp card).
 * Stamps are computed server-side from THIS account phone's non-cancelled
 * orders (1 stamp per order). The prize (admin-controlled in
 * /admin/settings) is only revealed after the first stamp.
 */

import { resolveCustomer, loadSmartCardTarget } from "@/lib/customer-auth";
import { countOrdersForPhone } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ error: "Not configured." }, 503);
  }
  const customer = await resolveCustomer(request);
  if (!customer) return apiJson({ error: "Sign in first." }, 401);
  const db = getSupabaseService();
  if (!db) return apiJson({ error: "Not configured." }, 503);

  const cfg = await loadSmartCardTarget();
  const count = await countOrdersForPhone(db, customer.phone);
  const target = Math.max(1, cfg.target);
  const stamps = count > 0 && count % target === 0 ? target : count % target;

  return apiJson({
    card: {
      stamps,
      orderCount: count,
      target,
      cycles: Math.floor(count / target),
      unlocked: count >= target,
      revealed: count >= 1, // prize visible after the first order
      enabled: cfg.enabled,
      minOrderTaka: cfg.minOrderTaka,
      reward: { title: cfg.rewardTitle, description: cfg.rewardDescription },
    },
  });
}

export type { SupabaseClient };
