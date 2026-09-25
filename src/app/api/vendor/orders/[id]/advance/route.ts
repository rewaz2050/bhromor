

import { routeId, vendorRoute } from "../../../_lib";

import { advanceVendorOrder } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";
import { notifyCustomerOfStatus } from "@/lib/customer-push";
import { notifyRiderOfOffer } from "@/lib/rider-push";
import { getSupabaseService } from "@/lib/supabase-server";
import type { OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = vendorRoute(
  "order-advance",
  async (ctx, request, routeContext) => {
    const body = (await request.json().catch(() => null)) as {
      to?: string;
    } | null;
    const to = (body?.to ?? "").trim().slice(0, 32);
    const order = await advanceVendorOrder(
      ctx.db,
      ctx.shopId,
      await routeId(routeContext),
      to,
    );
    // The shopper hears the shop's own tap too (2026-09-24): staff and vendor
    // both drive the same status machine, and until now only staff taps rang
    // the shopper's phone — a vendor confirming an order sent nothing.
    const service = getSupabaseService();
    if (service) {
      await notifyCustomerOfStatus(service, {
        phone: order.customer?.phone,
        orderNo: order.id,
        status: to as OrderStatus,
        total: order.total,
      });
      // The shop's own "Ready — call rider" summons a rider exactly like the
      // staff tap does, so the rider's phone must buzz for it too
      // (2026-09-25). Best-effort — the dispatch trigger already ran.
      if (to === "ready-for-pickup") {
        await notifyRiderOfOffer(service, order.id);
      }
    }
    return apiJson({ order });
  },
  { limit: 30 },
);
