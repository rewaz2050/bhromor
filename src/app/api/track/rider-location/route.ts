/**
 * GET /api/track/rider-location?orderId=&phone= — public rider live position
 * for tracking (free, no cost).
 *
 * Same proof as the track lookup: order ID + the phone the order was placed
 * with. The order ID is guessable, so the phone check is what keeps a
 * stranger from watching someone's rider move.
 *
 * Live tracking pass (2026-10-08):
 *   • rate-limited like every other public lookup — the tracker now polls
 *     this every 10 s while a parcel is on the road, and an endpoint with no
 *     limiter at all was one reload-loop away from a self-inflicted outage;
 *   • answers `liveChannel`, the Supabase Realtime broadcast name the rider's
 *     board publishes fixes to. It is derived from the order number + the
 *     stored phone, so handing it out costs nothing extra and only a caller
 *     who already passed the phone check ever sees it (`lib/live-track-channel`).
 */
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabase-server";
import { findOwnedOrder } from "@/lib/db/order-lookup";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { liveTrackChannel } from "@/lib/live-track-channel";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
/** 60/min: the tracker polls 6×/min, so a whole family watching on one
 *  connection still fits, and a runaway tab cannot hammer the database. */
const LIMIT = 60;

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
  const ip = clientIpFromHeaders(req.headers);
  const gate = checkRateLimit(`track-rider-loc:${ip}`, LIMIT, WINDOW_MS);
  if (!gate.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(gate.retryAfterSec));
    return res;
  }

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

  // The channel is answered even when no fix has landed yet: the tracker
  // subscribes first and shows the pin the moment the rider's phone reports.
  const channel = liveTrackChannel(order.id, order.customer_phone);

  if (rider.lat == null || rider.lng == null) {
    return NextResponse.json(
      { error: "rider location not available yet", liveChannel: channel },
      { status: 404 },
    );
  }

  return NextResponse.json({
    lat: rider.lat,
    lng: rider.lng,
    updatedAt: rider.last_location_at,
    isOnline: rider.is_online,
    liveChannel: channel,
  });
}
