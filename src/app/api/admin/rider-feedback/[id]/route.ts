/**
 * PATCH /api/admin/rider-feedback/:orderId — { hidden: boolean }: keep an
 * abusive or unfair comment from the rider (staff still see it) (item X).
 */
import { apiError, apiJson } from "@/lib/api-response";
import { setFeedbackHidden } from "@/lib/db/delivery-feedback";
import { getSupabaseService } from "@/lib/supabase-server";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = staffRoute(
  "rider-feedback-hide",
  async (_ctx, request, routeContext) => {
    const id = await routeId(routeContext);
    if (!UUID.test(id)) return apiError("That order id is not valid.", 422);
    const body = (await request.json().catch(() => null)) as { hidden?: unknown } | null;
    if (!body || typeof body.hidden !== "boolean") return apiError("hidden must be true or false.", 422);
    const service = getSupabaseService();
    if (!service) return apiError("Service role is not configured.", 503);
    const found = await setFeedbackHidden(service, id, body.hidden);
    if (!found) return apiError("No rating found for that order.", 404);
    return apiJson({ ok: true, hidden: body.hidden });
  },
  { limit: 60 },
);
