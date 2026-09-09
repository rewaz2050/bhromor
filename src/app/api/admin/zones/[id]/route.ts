/** DELETE /api/admin/zones/[id] — blocked for the last zone / zones with orders. */
import { deleteZone } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const DELETE = staffRoute(
  "zones-delete",
  async ({ db }, _request, routeContext) => {
    await deleteZone(db, await routeId(routeContext));
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
