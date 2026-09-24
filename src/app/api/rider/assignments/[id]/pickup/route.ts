import { apiJson } from "@/lib/api-response";
import { assignmentOrderRef, pickupRiderAssignment } from "@/lib/db/riders";
import { getSupabaseService } from "@/lib/supabase-server";
import { notifyCustomerOfStatus } from "@/lib/customer-push";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/pickup — rider confirms pickup. */
export const POST = riderRoute(
  "pickup",
  async (ctx, _request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    await pickupRiderAssignment(ctx.db, assignmentId);
    // Shopper's milestone #3 (2026-09-24): the parcel is on the bike. Read the
    // order with the service client — a rider's RLS scope cannot see it, and
    // the push needs the checkout phone.
    const service = getSupabaseService();
    if (service) {
      const ref = await assignmentOrderRef(service, assignmentId);
      if (ref) {
        await notifyCustomerOfStatus(service, {
          phone: ref.phone,
          orderNo: ref.orderNo,
          status: "out-for-delivery",
          total: ref.total,
        });
      }
    }
    return apiJson({ pickedUp: true });
  },
);
