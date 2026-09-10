import { apiJson } from "@/lib/api-response";
import { pickupRiderAssignment } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/pickup — rider confirms pickup. */
export const POST = riderRoute(
  "pickup",
  async (ctx, _request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    await pickupRiderAssignment(ctx.db, assignmentId);
    return apiJson({ pickedUp: true });
  },
);
