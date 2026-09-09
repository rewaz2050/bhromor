/**
 * POST /api/admin/orders/[orderNo]/advance { to, note? } — staff status
 * transition through the database §34 machine (illegal moves fail here).
 */
import { advanceOrderAsStaff } from "@/lib/db/admin";
import { AdminInputError } from "@/lib/db/admin";
import { notifyStaff } from "@/lib/db/engagement";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../_lib";
import type { OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "courier-assigned",
  "out-for-delivery",
  "delivered",
  "cancelled",
];

export const POST = staffRoute(
  "orders-advance",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    let body: { to?: string; note?: string };
    try {
      body = (await request.json()) as { to?: string; note?: string };
    } catch {
      throw new AdminInputError("Invalid request.");
    }
    if (!STATUSES.includes((body.to ?? "") as OrderStatus)) {
      throw new AdminInputError("Unknown status.");
    }
    const order = await advanceOrderAsStaff(
      db,
      id,
      body.to as OrderStatus,
      typeof body.note === "string" ? body.note : undefined,
    );
    const staffDb = getSupabaseService();
    if (staffDb) {
      const label = (body.to as string).replace(/-/g, " ");
      await notifyStaff(staffDb, {
        kind: "order",
        title: `Order ${order.id} → ${label}`,
        body:
          body.to === "cancelled"
            ? `${order.id} was cancelled; reserved stock is released.`
            : `${order.id} moved to ${label}.`,
        href: `/admin/orders/${order.id}`,
      });
    }
    return apiJson({ order });
  },
);
