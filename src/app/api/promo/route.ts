/**
 * GET /api/promo — LAUNCH OFFER counter (public).
 *
 * "প্রথম 1000 অর্ডারে ডেলিভারি ফ্রি" — returns the store-wide all-time
 * order count so the banner can show "X/1000 claimed" everywhere.
 * Demo mode (no service role) returns demoMode + zeroes; the banner falls
 * back to the browser-local order store.
 */

import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { LAUNCH_FREE_DELIVERY_LIMIT, FREE_DELIVERY_MIN_SUBTOTAL_PAISA } from "@/lib/delivery";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const limit = LAUNCH_FREE_DELIVERY_LIMIT;
  const minFreeTaka = FREE_DELIVERY_MIN_SUBTOTAL_PAISA / 100;

  if (!isServiceRoleConfigured()) {
    return apiJson({
      demoMode: true as const,
      totalOrders: 0,
      limit,
      remaining: limit,
      minFreeTaka,
      enabled: true,
    });
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
