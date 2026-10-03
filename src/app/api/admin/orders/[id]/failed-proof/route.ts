/**
 * GET /api/admin/orders/:id/failed-proof — the photo(s) a rider attached to a failed attempt
 * (staff-only; 202610020020). `:id` is the public order number (PS-…) or the row uuid.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { listFailedProofs } from "@/lib/db/failed-proof";
import { resolveOrderRowIds } from "@/lib/db/riders";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "order-failed-proof",
  async ({ db }, _request, context) => {
    const id = await routeId(context);
    if (!id) return apiError("An order is required.", 422);
    const [orderId] = await resolveOrderRowIds(db, [id]);
    return apiJson(await listFailedProofs(db, orderId));
  },
  { limit: 60 },
);
