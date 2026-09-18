/**
 * POST /api/track/cancel — the customer cancels their own order.
 *
 * The receipt and the checkout have promised "ভুল হলে track page থেকে বাতিল
 * করুন" since the wallet-payment slice; until now nothing on /track could do
 * it (UX audit 2026-09-18, P1 #14). Same ownership proof as every other
 * track sub-route: order number + the phone the order was placed with.
 *
 * Rules mirror ps_advance_order's cancel branch so the customer can do
 * EXACTLY what the admin's Cancel button does, no more:
 *   • allowed from pending / confirmed / preparing (before the parcel is
 *     packed and a rider is called) — later stages answer 409 with a
 *     "call us" message; a cancelled order is idempotent (200).
 *   • a bKash/Nagad payment still under verification is settled as
 *     REJECTED (the P1 #8 rule) — the track page then says "not accepted",
 *     never "under verification" on a cancelled order.
 *   • the stock reservation is released by trg_orders_release_on_cancel
 *     (an AFTER UPDATE trigger) — nothing to do here.
 *   • the history row says WHO cancelled, and staff get an inbox notice.
 */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";
import { findOwnedOrder } from "@/lib/db/order-lookup";
import { notifyStaff } from "@/lib/db/engagement";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { CUSTOMER_CANCELLABLE, type OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 10;
const NO_STORE = { "Cache-Control": "no-store" };

interface OrderRow {
  id: string;
  order_no: string | null;
  status: string;
  customer_phone: string | null;
  payment: "cod" | "bkash" | "nagad" | null;
  payment_status: "pending_verification" | "verified" | "rejected" | null;
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const gate = checkRateLimit(`track-cancel:${ip}`, LIMIT, WINDOW_MS);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts — please wait a moment." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    orderId?: string;
    phone?: string;
    reason?: string;
  } | null;
  const orderId = body?.orderId?.trim();
  const phone = body?.phone?.trim();
  const reason = (body?.reason ?? "").toString().trim().slice(0, 200);
  if (!orderId || !phone) {
    return json({ error: "orderId and phone required" }, 400);
  }

  const db = getSupabaseService();
  if (!db) return json({ error: "not configured" }, 503);

  // Order number (what the storefront holds) or uuid; phone proves ownership.
  // Vague 404 on id OR phone mismatch — same as /api/track.
  const order = await findOwnedOrder<OrderRow>(
    db,
    orderId,
    phone,
    "id, order_no, status, customer_phone, payment, payment_status",
  );
  if (!order) return json({ error: "order not found" }, 404);

  if (order.status === "cancelled") {
    return json({ ok: true, status: "cancelled", already: true });
  }
  if (!CUSTOMER_CANCELLABLE.includes(order.status as OrderStatus)) {
    return json(
      {
        error: "too late to cancel online",
        code: "too_late",
        status: order.status,
      },
      409,
    );
  }

  // P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED.
  const rejectPayment =
    (order.payment === "bkash" || order.payment === "nagad") &&
    order.payment_status === "pending_verification";
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: "cancelled", updated_at: now };
  if (rejectPayment) {
    patch.payment_status = "rejected";
    patch.payment_verified_at = now;
  }
  // Guard the transition in the WHERE: if staff moved the order on between
  // our read and this write, nothing changes and we answer honestly.
  const { data: updated, error: upErr } = await db
    .from("orders")
    .update(patch)
    .eq("id", order.id)
    .in("status", [...CUSTOMER_CANCELLABLE])
    .select("id, status");
  if (upErr) return json({ error: upErr.message }, 500);
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    return json({ error: "too late to cancel online", code: "too_late" }, 409);
  }

  const note = `Cancelled by customer from the track page${reason ? ` — ${reason}` : ""}`;
  await db.from("order_status_history").insert({
    order_id: order.id,
    status: "cancelled",
    note,
  });
  if (rejectPayment) {
    await db.from("order_status_history").insert({
      order_id: order.id,
      status: "cancelled",
      note: "Payment rejected — order cancelled by the customer (refund from the shop wallet, offline)",
    });
  }
  await notifyStaff(db, {
    kind: "order",
    title: `Customer cancelled ${order.order_no ?? order.id}`,
    body: reason || "Cancelled from the track page before packing.",
    href: `/admin/orders/${order.id}`,
  });

  return json({ ok: true, status: "cancelled", paymentRejected: rejectPayment });
}
