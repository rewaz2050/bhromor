/** GET /api/admin/riders/:id/overview — one rider's money, COD risk, performance and ledgers (staff-only, read-only). */
import { apiError, apiJson } from "@/lib/api-response";
import { getRiderOverview } from "@/lib/db/rider-overview";
import { assessRisk } from "@/lib/rider-risk";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "rider-overview",
  async ({ db }, _request, context) => {
    const id = await routeId(context);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("A valid rider id is required.", 422);
    const overview = await getRiderOverview(db, id);
    if (!overview) return apiJson({ ready: false, overview: null, assessment: null });
    return apiJson({ ready: true, overview, assessment: assessRisk(overview) });
  },
  { limit: 60 },
);
