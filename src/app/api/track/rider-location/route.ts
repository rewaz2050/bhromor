/** GET /api/track/rider-location?orderId= — public rider live position for tracking (free, no cost) */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId")?.trim();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const db = getSupabaseService();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  // Find order and its rider assignment
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, rider_id, status")
    .or(`id.eq.${orderId},order_no.eq.${orderId.toUpperCase()}`)
    .single();
  if (orderErr || !order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (!order.rider_id) return NextResponse.json({ error: "no rider assigned yet" }, { status: 404 });
  if (order.status !== "out-for-delivery" && order.status !== "courier-assigned" && order.status !== "ready-for-pickup") {
    return NextResponse.json({ error: "rider not on the way yet" }, { status: 400 });
  }

  const { data: rider, error: riderErr } = await db
    .from("riders")
    .select("lat, lng, last_location_at, is_online")
    .eq("id", order.rider_id)
    .single();
  if (riderErr || !rider) return NextResponse.json({ error: "rider not found" }, { status: 404 });

  const lat = (rider as any).lat;
  const lng = (rider as any).lng;
  const last = (rider as any).last_location_at;
  if (lat == null || lng == null) {
    return NextResponse.json({ error: "rider location not available yet" }, { status: 404 });
  }

  return NextResponse.json({ lat, lng, updatedAt: last, isOnline: (rider as any).is_online });
}
