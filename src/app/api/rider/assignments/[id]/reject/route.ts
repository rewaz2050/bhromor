import { apiJson } from "@/lib/api-response";
import { rejectRiderAssignment } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/reject — rider declines an offer; the
 * order is re-offered to the next eligible rider automatically. */
export const POST = riderRoute(
  "reject",
  async (ctx, _request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    await rejectRiderAssignment(ctx.db, assignmentId);
    return apiJson({ rejected: true });
  },
);
