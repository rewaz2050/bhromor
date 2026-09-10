import { apiJson } from "@/lib/api-response";
import { failedRiderAttempt, RiderInputError } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/failed — customer unreachable, reschedule etc */
export const POST = riderRoute(
  "failed",
  async (ctx, request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (reason.length < 5) {
      throw new RiderInputError("Please provide a reason (at least 5 chars).", 422);
    }
    await failedRiderAttempt(ctx.db, assignmentId, reason);
    return apiJson({ failed: true, reason });
  },
);
