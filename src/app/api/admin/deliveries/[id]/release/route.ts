/**
 * POST /api/admin/deliveries/:id/release — staff takes an ACCEPTED or PICKED-UP
 * job away from an unresponsive rider (202610010001). Body: { reason }.
 * (Offered invitations are withdrawn with /cancel instead.)
 */
import { releaseDispatchAssignment } from "@/lib/db/riders";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "deliveries-release",
  async ({ db }, request, context) => {
    const id = await routeId(context as { params?: Promise<{ id?: string }> });
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return apiError("A valid assignment id is required.", 422);
    }
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (reason.length < 5) {
      return apiError("Give a short reason (at least 5 characters).", 422);
    }
    await releaseDispatchAssignment(db, id, reason);
    return apiJson({ ok: true });
  },
  { limit: 20 },
);
