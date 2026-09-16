/**
 * POST /api/admin/orders/[orderNo]/return { action: "approve" | "reject" |
 * "complete", note? } — the shop's decision on a requested return (P1 #13).
 *
 * All transitions are guarded in ps_return_action: approve moves the return
 * order to 'ready-for-pickup' (the state dispatch offers to riders), reject
 * cancels it, complete marks the leg refunded once the item is back.
 */
import { performReturnAction } from "@/lib/db/returns";
import { apiError, apiJson } from "@/lib/api-response";
import { notifyStaff } from "@/lib/db/engagement";
import { getSupabaseService } from "@/lib/supabase-server";
import { routeId, staffRoute } from "../../../_lib";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["approve", "reject", "complete"]);

export const POST = staffRoute(
  "orders-return-action",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    let body: { action?: string; note?: string };
    try {
      body = (await request.json()) as { action?: string; note?: string };
    } catch {
      return apiError("Invalid request.", 400);
    }
    const action = body?.action;
    if (typeof action !== "string" || !ACTIONS.has(action)) {
      return apiError("Unknown return action.", 422);
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";

    // ps_return_action is service-only since 202609160004 (the anon key must
    // not be able to approve returns); staffRoute has already verified the
    // staff session, so the decision runs on the service client — the same
    // pattern as ps_credit_referrer in the advance route.
    const service = getSupabaseService();
    if (!service) {
      return apiError(
        "Return actions need SUPABASE_SERVICE_ROLE_KEY on the server (docs/go-live.md).",
        503,
      );
    }

    try {
      await performReturnAction(
        service,
        id,
        action as "approve" | "reject" | "complete",
        note,
      );
      if (action === "approve") {
        await notifyStaff(db, {
          kind: "order",
          title: "Return approved — dispatch the pickup",
          body: `Order ${id} is ready for rider pickup (Admin → Deliveries).`,
          href: "/admin/deliveries",
        });
      }
      return apiJson({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "return action failed";
      return apiError(message, 409);
    }
  },
);
