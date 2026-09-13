/** POST /api/track/reschedule — customer reschedules delivery (free). */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/orders";

export const dynamic = "force-dynamic";

const WINDOWS = ["9-11", "11-1", "2-4", "4-6", "6-8", "8-10", "express"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    orderId?: string;
    phone?: string;
    scheduled_at?: string;
    delivery_window?: string;
  } | null;
  const orderId = body?.orderId?.trim();
  const phone = body?.phone?.trim();
  const scheduledAt = body?.scheduled_at?.trim();
  const window = body?.delivery_window?.trim();
  // Same proof as the track lookup: order ID + the phone it was placed with.
  if (!orderId || !phone || !scheduledAt || !window) {
    return NextResponse.json(
      { error: "orderId, phone, scheduled_at and delivery_window required" },
      { status: 400 },
    );
  }
  if (!WINDOWS.includes(window)) {
    return NextResponse.json({ error: "unknown delivery window" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(scheduledAt)) {
    return NextResponse.json({ error: "invalid scheduled time" }, { status: 400 });
  }

  const db = getSupabaseService();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data: order, error } = await db
    .from("orders")
    .select("id, status, customer_phone")
    .or(`id.eq.${orderId},order_no.eq.${orderId.toUpperCase()}`)
    .single();
  // Vague 404 on id OR phone mismatch — same as /api/track.
  const stored = (order as { customer_phone?: string } | null)?.customer_phone ?? "";
  if (
    error ||
    !order ||
    normalizePhone(stored) === "" ||
    normalizePhone(stored) !== normalizePhone(phone)
  ) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  if (order.status === "delivered" || order.status === "cancelled") {
    return NextResponse.json({ error: "cannot reschedule delivered/cancelled" }, { status: 400 });
  }

  const { error: upErr } = await db
    .from("orders")
    .update({ scheduled_at: scheduledAt, delivery_window: window, updated_at: new Date().toISOString() })
    .eq("id", order.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await db.from("order_status_history").insert({
    order_id: order.id,
    status: order.status,
    note: `Rescheduled by customer to ${scheduledAt} ${window} — free`,
  });

  return NextResponse.json({ ok: true });
}
