/**
 * POST /api/admin/orders/[orderNo]/payment { action: "verified" |
 * "rejected", note? } — the shop's decision on a bKash/Nagad payment (P1 #8).
 *
 * The shop checks the TRXID against its own wallet and then:
 *   - 'verified'  → payment_status='verified'; the order may now start
 *                   fulfilment (ps_advance_order un-gates the statuses);
 *   - 'rejected'  → payment_status='rejected' + the order is cancelled,
 *                   stock released (refund to the customer is offline).
 */
import { verifyPaymentAsStaff } from "@/lib/db/admin";
import { getSupabaseService } from "@/lib/supabase-server";
import { notifyStaff } from "@/lib/db/engagement";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../_lib";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["verified", "rejected"]);

export const POST = staffRoute(
  "orders-payment-verify",
  async ({ db }, request, routeContext) => {
    const orderNo = await routeId(routeContext);
    let body: { action?: string; note?: string };
    try {
      body = (await request.json()) as { action?: string; note?: string };
    } catch {
      return apiJson({ error: "Invalid request." }, 400);
    }
    const action = body?.action;
    if (typeof action !== "string" || !ACTIONS.has(action)) {
      return apiJson(
        { error: "Pick a decision: verified or rejected." },
        422,
      );
    }
    const order = await verifyPaymentAsStaff(
      db,
      orderNo,
      action as "verified" | "rejected",
      typeof body.note === "string" ? body.note : undefined,
    );
    const staffDb = getSupabaseService();
    if (staffDb) {
      await notifyStaff(staffDb, {
        kind: "order",
        title:
          action === "verified"
            ? `Payment verified — ${order.id}`
            : `Payment rejected — ${order.id}`,
        body:
          action === "verified"
            ? `${order.id} — wallet payment confirmed; the order may start fulfilment.`
            : `${order.id} — payment rejected; the order is cancelled and stock released. Refund from the shop wallet is offline.`,
        href: `/admin/orders/${order.id}`,
      });
    }
    return apiJson({ ok: true, action, order });
  },
);
