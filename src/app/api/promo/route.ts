/**
 * GET /api/promo — real-time "first 10 orders free" promo status.
 * Free delivery applies ONLY inside Sunamganj city Zone A.
 * Returns total orders, remaining free slots, and whether promo is active.
 * Public, no auth, cached 30s.
 */

import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { FIRST_FREE_DELIVERY_LIMIT } from "@/lib/delivery";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isServiceRoleConfigured()) {
    // Demo mode: pretend 0 orders, promo active
    return apiJson({
      totalOrders: 0,
      remainingFree: FIRST_FREE_DELIVERY_LIMIT,
      promoActive: true,
      limit: FIRST_FREE_DELIVERY_LIMIT,
      demoMode: true,
    });
  }

  try {
    const db = getSupabaseService();
    if (!db) {
      return apiJson({
        totalOrders: 0,
        remainingFree: FIRST_FREE_DELIVERY_LIMIT,
        promoActive: true,
        limit: FIRST_FREE_DELIVERY_LIMIT,
      });
    }

    const { count, error } = await db
      .from("orders")
      .select("id", { count: "exact", head: true });

    if (error) throw error;

    const total = count ?? 0;
    const remaining = Math.max(0, FIRST_FREE_DELIVERY_LIMIT - total);
    return apiJson({
      totalOrders: total,
      remainingFree: remaining,
      promoActive: total < FIRST_FREE_DELIVERY_LIMIT,
      limit: FIRST_FREE_DELIVERY_LIMIT,
    });
  } catch {
    // Fail open: still show promo as active, don't break checkout
    return apiJson({
      totalOrders: 0,
      remainingFree: FIRST_FREE_DELIVERY_LIMIT,
      promoActive: true,
      limit: FIRST_FREE_DELIVERY_LIMIT,
    });
  }
}
