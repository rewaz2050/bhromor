/**
 * POST /api/vendor/orders/[orderNo]/payment { action: "verified" |
 * "rejected", note? } — the SHOP's decision on a bKash/Nagad payment.
 *
 * 2026-09-18: the database function has always allowed the owning shop
 * (ps_verify_payment: `ps_is_admin() or orders.shop_id = ps_vendor_shop()`),
 * but only the staff route existed, so every wallet order sat at "verify"
 * until PROSANTI staff looked. The shop is the one with the wallet — it
 * checks its own bKash/Nagad app and decides here.
 */
import { routeId, vendorRoute } from "../../../_lib";
import { verifyPaymentAsVendor } from "@/lib/db/vendor";
import { notifyStaff } from "@/lib/db/engagement";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["verified", "rejected"]);

export const POST = vendorRoute(
  "order-payment",
  async (ctx, request, routeContext) => {
    const orderNo = await routeId(routeContext);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      note?: unknown;
    } | null;
    const action = body?.action;
    if (typeof action !== "string" || !ACTIONS.has(action)) {
      return apiError("Pick a decision: verified or rejected.", 422);
    }
    const order = await verifyPaymentAsVendor(
      ctx.db,
      ctx.shopId,
      orderNo,
      action as "verified" | "rejected",
      typeof body?.note === "string" ? body.note : undefined,
    );
    // Staff inbox: the shop settled the money itself — nothing for staff to
    // do, but the decision is visible in the same feed as staff decisions.
    const service = getSupabaseService();
    if (service) {
      await notifyStaff(service, {
        kind: "order",
        title:
          action === "verified"
            ? `Payment verified by the shop — ${order.id}`
            : `Payment rejected by the shop — ${order.id}`,
        body:
          action === "verified"
            ? `${order.id} — the shop confirmed the wallet payment; the order may start fulfilment.`
            : `${order.id} — the shop rejected the wallet payment; the order is cancelled and stock released.`,
        href: `/admin/orders/${order.id}`,
      }).catch(() => undefined);
    }
    return apiJson({ ok: true, action, order });
  },
  { limit: 30 },
);
