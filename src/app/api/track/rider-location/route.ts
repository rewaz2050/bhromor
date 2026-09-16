/**
 * GET /api/track/rider-location?orderId=&phone= — public rider live position
 * for tracking (free, no cost).
 *
 * Same proof as the track lookup: order ID + the phone the order was placed
 * with. The order ID is guessable, so the phone check is what keeps a
 * stranger from watching someone's rider move.
 */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";
import { findOwnedOrder } from "@/lib/db/order-lookup";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: string;
  rider_id: string | null;
  status: string;
  customer_phone: string | null;
}

interface RiderRow {
  lat: number | null;
  lng: number | null;
  last_location_at: string | null;
  is_online: boolean | null;
}

const EN_ROUTE = new Set(["out-for-delivery", "courier-assigned", "ready-for-pickup"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId")?.trim();
  const phone = searchParams.get("phone")?.trim();
  if (!orderId || !phone) {
    return NextResponse.json(
      { error: "orderId and phone required" },
      { status: 400 },
    );
  }

  const db = getSupabaseService();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  // Order number (what the storefront holds) or uuid; phone proves ownership.
  // Vague 404 on id OR phone mismatch — same as /api/track.
  const order = await findOwnedOrder<OrderRow>(
    db,
    orderId,
    phone,
    "id, rider_id, status, customer_phone",
  );
  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  if (!order.rider_id) return NextResponse.json({ error: "no rider assigned yet" }, { status: 404 });
  if (!EN_ROUTE.has(order.status)) {
    return NextResponse.json({ error: "rider not on the way yet" }, { status: 400 });
  }

  const { data, error: riderErr } = await db
    .from("riders")
    .select("lat, lng, last_location_at, is_online")
    .eq("id", order.rider_id)
    .single();
  const rider = data as RiderRow | null;
  if (riderErr || !rider) return NextResponse.json({ error: "rider not found" }, { status: 404 });

  if (rider.lat == null || rider.lng == null) {
    return NextResponse.json({ error: "rider location not available yet" }, { status: 404 });
  }

  return NextResponse.json({
    lat: rider.lat,
    lng: rider.lng,
    updatedAt: rider.last_location_at,
    isOnline: rider.is_online,
  });
}
