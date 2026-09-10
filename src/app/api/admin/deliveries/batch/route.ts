/** POST /api/admin/deliveries/batch — batch assign multiple orders to one rider (route optimization) */
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "deliveries-batch",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as {
      riderId?: string;
      orderIds?: string[];
    } | null;
    const riderId = body?.riderId?.trim();
    const orderIds = body?.orderIds;
    if (!riderId || !Array.isArray(orderIds) || orderIds.length === 0) {
      return apiError("riderId and orderIds required", 422);
    }
    if (orderIds.length > 5) {
      return apiError("max 5 orders per batch", 422);
    }
    const supa = getSupabaseService();
    if (!supa) return apiError("service not configured", 503);
    const { data, error } = await supa.rpc("ps_assign_batch_to_rider", {
      p_rider_id: riderId,
      p_order_ids: orderIds,
    });
    if (error) {
      // Fallback individual
      let assigned = 0;
      for (const oid of orderIds) {
        const { error: e2 } = await supa.rpc("ps_assign_order_to_rider", {
          p_order_id: oid,
          p_rider_id: riderId,
        } as any);
        if (!e2) assigned++;
      }
      if (assigned === 0) {
        return apiError(error.message, 500);
      }
      return apiJson({ assigned });
    }
    return apiJson({ assigned: data });
  },
  { limit: 20 }
);
