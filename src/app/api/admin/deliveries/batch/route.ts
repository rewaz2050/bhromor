/**
 * POST /api/admin/deliveries/batch { riderId, orderIds } — staff assigns up
 * to 5 orders to ONE rider in a single call (route batching).
 *
 * ps_assign_batch_to_rider (202609160005) withdraws each order's live offer
 * and offers it to the chosen rider; orders that are not dispatchable yet
 * are skipped, not failed. It is service-only (202609160004), so it runs on
 * the service client after staffRoute has verified the session.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { isOrderRowId, resolveOrderRowIds } from "@/lib/db/riders";

export const dynamic = "force-dynamic";

const ORDER_REF_RE = /^[A-Za-z0-9-]{1,64}$/;

export const POST = staffRoute(
  "deliveries-batch",
  async (_ctx, request) => {
    const body = (await request.json().catch(() => null)) as {
      riderId?: string;
      orderIds?: string[];
    } | null;
    const riderId = body?.riderId?.trim();
    const orderRefs = body?.orderIds;
    if (!riderId || !Array.isArray(orderRefs) || orderRefs.length === 0) {
      return apiError("riderId and orderIds required", 422);
    }
    if (orderRefs.length > 5) {
      return apiError("max 5 orders per batch", 422);
    }
    // Order references may be public order numbers (what the panel holds)
    // or row ids; the rider is always a row id.
    if (
      !isOrderRowId(riderId) ||
      !orderRefs.every((id) => typeof id === "string" && ORDER_REF_RE.test(id.trim()))
    ) {
      return apiError("riderId and orderIds must be ids", 422);
    }
    const supa = getSupabaseService();
    if (!supa) return apiError("service not configured", 503);
    const orderIds = await resolveOrderRowIds(supa, orderRefs);
    const { data, error } = await supa.rpc("ps_assign_batch_to_rider", {
      p_rider_id: riderId,
      p_order_ids: orderIds,
    });
    if (error) {
      // P0001 'rider not available' etc. are the function's own rules; a
      // schema-level failure (missing repair) is named so it can be fixed.
      if (/rider_assignments|ps_assign_order_to_rider/.test(error.message)) {
        return apiError(
          "Batch assign needs supabase/migrations/202609160005_dispatch_reoffer_repair.sql (see /api/health).",
          503,
        );
      }
      return apiError(error.message || "batch assign failed", 409);
    }
    return apiJson({ assigned: typeof data === "number" ? data : 0 });
  },
  { limit: 20 },
);
