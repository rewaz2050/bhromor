/** POST /api/admin/deliveries/:id/cancel — staff cancels a live assignment
 * (wrong rider, order cancelled, manual re-offer). */
import { cancelDispatchAssignment } from "@/lib/db/riders";
import { apiJson } from "@/lib/api-response";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "deliveries-cancel",
  async ({ db }, _request, context) => {
    const id = await routeId(context as { params?: Promise<{ id?: string }> });
    await cancelDispatchAssignment(db, id);
    return apiJson({ ok: true });
  },
  { limit: 20 },
);
