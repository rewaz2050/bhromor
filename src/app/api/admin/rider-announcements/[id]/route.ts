/** DELETE /api/admin/rider-announcements/:id — withdraw a message from every rider's inbox. */
import { apiError, apiJson } from "@/lib/api-response";
import { deleteAnnouncement } from "@/lib/db/rider-inbox";
import { staffRoute, routeId } from "../../_lib";

export const dynamic = "force-dynamic";

export const DELETE = staffRoute(
  "rider-announcements-delete",
  async ({ db }, _request, context) => {
    const id = await routeId(context);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("A valid announcement id is required.", 422);
    await deleteAnnouncement(db, id);
    return apiJson({ ok: true });
  },
  { limit: 30 },
);
