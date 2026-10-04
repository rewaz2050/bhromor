import { apiJson } from "@/lib/api-response";
import { notifyStaff } from "@/lib/db/engagement";
import { assignmentOrderRef, releaseAcceptedAssignment, RiderInputError } from "@/lib/db/riders";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/rider/assignments/:id/release — the rider hands back a job they
 * accepted but have not picked up (bike trouble, too far…). The order goes
 * straight back to the area queue without them, and staff get a bell so a
 * pattern of hand-backs is visible. Needs `{ reason }` (≥ 5 characters).
 */
export const POST = riderRoute(
  "release",
  async (ctx, request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (reason.length < 5) {
      throw new RiderInputError("কারণ লিখুন (কমপক্ষে ৫ অক্ষর)।", 422);
    }
    // ctx.db = the rider's own client: the RPC resolves them through auth.uid().
    await releaseAcceptedAssignment(ctx.db, assignmentId, reason);
    // Best effort: a failing bell must never undo a hand-back that already happened.
    try {
      const ref = await assignmentOrderRef(ctx.service, assignmentId);
      await notifyStaff(ctx.service, {
        kind: "order",
        title: `Rider handed back ${ref?.orderNo ?? "an order"}`,
        body: `${ctx.rider.name}: ${reason}. It is back in the area queue.`,
        href: "/admin/deliveries",
      });
    } catch {
      /* ignore */
    }
    return apiJson({ released: true });
  },
);
