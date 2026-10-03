/** GET /api/admin/riders/:id/gps-flags — one rider's GPS-jump alerts (staff-only, read-only; migration 202610020019). */
import { apiError, apiJson } from "@/lib/api-response";
import { getRiderGpsFlags } from "@/lib/db/rider-gps-flags";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "rider-gps-flags",
  async ({ db }, _request, context) => {
    const id = await routeId(context);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("A valid rider id is required.", 422);
    return apiJson(await getRiderGpsFlags(db, id));
  },
  { limit: 60 },
);
