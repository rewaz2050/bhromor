/** GET /api/admin/riders/:id/overview — one rider's money, COD risk, performance and ledgers (staff-only, read-only). */
import { apiError, apiJson } from "@/lib/api-response";
import { getRiderOverview } from "@/lib/db/rider-overview";
import { readDispatchSettings } from "@/lib/db/dispatch-settings";
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
    // J: the SQL reports the legacy ৳5,000; the live cap is an admin setting.
    const { cashCap } = await readDispatchSettings(db);
    const live = { ...overview, risk: { ...overview.risk, cashLimit: cashCap } };
    return apiJson({ ready: true, overview: live, assessment: assessRisk(live) });
  },
  { limit: 60 },
);
