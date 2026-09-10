/** POST /api/track/reschedule — customer reschedules delivery (free) */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { orderId?: string; scheduled_at?: string; delivery_window?: string } | null;
  const orderId = body?.orderId?.trim();
  const scheduledAt = body?.scheduled_at?.trim();
  const window = body?.delivery_window?.trim();
  if (!orderId || !scheduledAt || !window) {
    return NextResponse.json({ error: "orderId, scheduled_at, delivery_window required" }, { status: 400 });
  }
  const db = getSupabaseService();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data: order, error } = await db
    .from("orders")
    .select("id, status")
    .or(`id.eq.${orderId},order_no.eq.${orderId.toUpperCase()}`)
    .single();
  if (error || !order) return NextResponse.json({ error: "order not found" }, { status: 404 });
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
