/**
 * POST /api/admin/orders/[orderNo]/advance { to, note? } — staff status
 * transition through the database §34 machine (illegal moves fail here).
 */
import { advanceOrderAsStaff } from "@/lib/db/admin";
import { AdminInputError } from "@/lib/db/admin";
import { notifyStaff } from "@/lib/db/engagement";
import { notifyCustomerOfStatus } from "@/lib/customer-push";
import { notifyRiderOfOffer } from "@/lib/rider-push";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { formatBdt } from "@/lib/format";
import { routeId, staffRoute } from "../../../_lib";
import type { OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** What ps_credit_referrer answers with — granted, or why not. */
interface ReferralCredit {
  granted: boolean;
  code?: string;
  reward?: number;
  reason?: string;
}

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
      // The shopper hears it too (2026-09-24): every real transition has its
      // own message now, so this route notifies on EVERY advance and lets
      // `notifyCustomerOfStatus` decide the copy (a status the shop skips
      // simply produces no push).
      await notifyCustomerOfStatus(staffDb, {
        phone: order.customer?.phone,
        orderNo: order.id,
        status: body.to as OrderStatus,
        total: order.total,
      });
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
      // "Ready — call rider" is the tap that summons a rider, and until
      // 2026-09-25 the offer it created reached the rider ONLY through their
      // job poll — which stops while the phone is in a pocket. Buzz the
      // rider's device too. Best-effort: the offer exists either way.
      if (body.to === "ready-for-pickup") {
        await notifyRiderOfOffer(staffDb, id);
      }
    }
    // P0 #7 — a delivered friend order is the moment the referral is earned:
    // the referrer's ৳50 is minted as a real single-use coupon. The SQL
    // function is idempotent per (code, referee), so re-firing this advance
    // (or a double-tapped button) cannot print a second reward.
    let referral: ReferralCredit | null = null;
    if (body.to === "delivered" && staffDb) {
      const { data, error } = await staffDb.rpc("ps_credit_referrer", {
        p_order_id: id,
      });
      if (!error && data && typeof data === "object") {
        referral = data as ReferralCredit | null;
        if (referral?.granted && referral.code) {
          await notifyStaff(staffDb, {
            kind: "system",
            title: `রেফারেল রিওয়ার্ড — ${referral.code}`,
            body: `${order.id} delivered · ${formatBdt(referral.reward ?? 0)} কোড প্রস্তুত — কাস্টমারকে ফোন/হোয়াটসঅ্যাপে পাঠান।`,
            href: "/admin/growth",
          });
        }
      }
    }
    return apiJson({ order, referral });
  },
);
