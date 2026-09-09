import { apiJson } from "@/lib/api-response";
import { deliverRiderAssignment } from "@/lib/db/riders";
import { RiderInputError } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/deliver — customer code proof. */
export const POST = riderRoute(
  "deliver",
  async (ctx, request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    const body = (await request.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) {
      throw new RiderInputError("Enter the 4-digit delivery code.", 422);
    }
    await deliverRiderAssignment(ctx.db, assignmentId, code);
    return apiJson({ delivered: true });
  },
);
