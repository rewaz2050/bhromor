/**
 * POST /api/admin/riders/:id/settle-claim — staff reject a rider's pending
 * settle claim (money never arrived). Approvals go through the existing
 * settle endpoint, which zeroes the balance and approves the claim.
 */
import { rejectSettleClaimByAdmin } from "@/lib/db/riders";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "riders-settle-claim",
  async ({ db }, request, context) => {
    const id = await routeId(context as { params?: Promise<{ id?: string }> });
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return apiError("A valid rider id is required.", 422);
    }
    const body: unknown = await request.json().catch(() => null);
    const b = (body ?? {}) as { action?: unknown; note?: unknown };
    if (b.action !== "reject") {
      return apiError("Unknown action — use the settle button to approve.", 422);
    }
    const note = typeof b.note === "string" ? b.note : "";
    await rejectSettleClaimByAdmin(db, id, note);
    return apiJson({ ok: true });
  },
  { limit: 20 },
);
