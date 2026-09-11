/**
 * GET /api/promo — LAUNCH OFFER counter (public).
 *
 * "প্রথম 1000 অর্ডারে ডেলিভারি ফ্রি" — returns the store-wide all-time
 * order count so the banner can show "X/1000 claimed" everywhere.
 */

import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { LAUNCH_FREE_DELIVERY_LIMIT, FREE_DELIVERY_MIN_SUBTOTAL_PAISA } from "@/lib/delivery";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const limit = LAUNCH_FREE_DELIVERY_LIMIT;
  const minFreeTaka = FREE_DELIVERY_MIN_SUBTOTAL_PAISA / 100;

  if (!isServiceRoleConfigured()) {
    return apiError("The offer counter is not available yet.", 503);
  }

  const db = getSupabaseService();
  let totalOrders = 0;
  if (db) {
    // "Claimed" = orders ever placed (all statuses — a claimed slot is a
    // placed order, cancelled or not; same count the pricing snapshot uses).
    const res = await db
      .from("orders")
      .select("id", { count: "exact", head: true });
    totalOrders = res.count ?? 0;
  }

  return apiJson({
    totalOrders,
    limit,
    remaining: Math.max(0, limit - totalOrders),
    minFreeTaka,
    enabled: totalOrders < limit,
  });
}
