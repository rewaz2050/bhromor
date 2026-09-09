import { apiJson } from "@/lib/api-response";
import { acceptRiderAssignment } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/accept — rider accepts an offer. */
export const POST = riderRoute(
  "accept",
  async (ctx, _request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    await acceptRiderAssignment(ctx.db, assignmentId);
    return apiJson({ accepted: true });
  },
);
