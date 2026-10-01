/**
 * POST /api/admin/orders/:id/failed-delivery — staff decision on an order whose
 * final delivery attempt failed (202610010001):
 *   { action: "redispatch" } → back to ready-for-pickup, area broadcast again;
 *   { action: "cancel" }     → order cancelled (a prepaid one is flagged for
 *                              an offline refund in the order history).
 * `:id` is the public order number (PS-…) or the row uuid.
 */
import { resolveFailedDelivery } from "@/lib/db/riders";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "orders-failed-delivery",
  async ({ db }, request, context) => {
    const id = await routeId(context as { params?: Promise<{ id?: string }> });
    if (!id) return apiError("An order is required.", 422);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      note?: unknown;
    } | null;
    const action =
      body?.action === "redispatch" || body?.action === "cancel" ? body.action : null;
    if (!action) return apiError("Action must be redispatch or cancel.", 422);
    const note = typeof body?.note === "string" ? body.note : "";
    if (action === "cancel" && note.trim().length < 3) {
      return apiError("Give a short reason for cancelling the order.", 422);
    }
    await resolveFailedDelivery(db, id, action, note);
    return apiJson({ ok: true });
  },
  { limit: 30 },
);
