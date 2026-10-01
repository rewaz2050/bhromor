import { apiJson } from "@/lib/api-response";
import { failedRiderAttempt, RiderInputError } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/rider/assignments/:id/failed — customer unreachable, wrong address…
 * Only with the parcel in hand (picked_up). The last allowed attempt
 * (delivery_max_attempts, default 2) closes the job: the response says
 * `final: true`, the rider is freed and staff get a redispatch/cancel task.
 */
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
    // ctx.db = the rider's own client (the RPC resolves them via auth.uid());
    // ctx.service only reads the counter + cap for the confirmation.
    const result = await failedRiderAttempt(ctx.db, assignmentId, reason, ctx.service);
    return apiJson({ failed: true, reason, ...result });
  },
);
