import { apiJson } from "@/lib/api-response";
import { acceptRiderAssignment, assignmentOrderRef } from "@/lib/db/riders";
import { notifyCustomerOfStatus } from "@/lib/customer-push";
import { getSupabaseService } from "@/lib/supabase-server";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/accept — rider accepts an offer. */
export const POST = riderRoute(
  "accept",
  async (ctx, _request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    await acceptRiderAssignment(ctx.db, assignmentId);
    // Accepting is the moment the order becomes `courier-assigned`, and the
    // rider's own RLS scope cannot read the customer row — resolve it with the
    // service client and tell the shopper a rider is on the job (2026-09-24).
    const service = getSupabaseService();
    if (service) {
      const ref = await assignmentOrderRef(service, assignmentId);
      if (ref) {
        await notifyCustomerOfStatus(service, {
          phone: ref.phone,
          orderNo: ref.orderNo,
          status: "courier-assigned",
          total: ref.total,
        });
      }
    }
    return apiJson({ accepted: true });
  },
);
