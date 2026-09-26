/**
 * POST /api/track/rate — the customer rates the DELIVERY (rider) 1–5 stars
 * (202609250008), from the track page after the order is delivered.
 *
 * Ownership proof is the same as every /api/track sub-route: the order
 * number + the phone the order was placed with. One rating per order —
 * the primary key on delivery_ratings makes a re-tap idempotent, never a
 * skewed average. The rating rolls into riders.rating_avg / rating_count,
 * which only the rider themself (and staff) can see.
 */

import { findOwnedOrder } from "@/lib/db/order-lookup";
import { applyDeliveryRating } from "@/lib/db/riders";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return apiError("Forbidden", 403);
  }
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`track-rate:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — এক মিনিট পরে চেষ্টা করুন।", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }
  const service = getSupabaseService();
  if (!isServiceRoleConfigured() || !service) {
    return apiError("রেটিং সাময়িকভাবে বন্ধ আছে।", 503);
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    phone?: unknown;
    stars?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const stars = Number(body?.stars);
  if (!id || !phone) return apiError("Order ID ও ফোন নম্বর দিন।", 400);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return apiError("১ থেকে ৫ এর মধ্যে রেটিং দিন।", 422);
  }

  const order = await findOwnedOrder(
    service,
    id,
    phone,
    "id,status,rider_id,customer_phone",
  );
  if (!order) {
    // Deliberately vague — same as /api/track: never reveal which part was wrong.
    return apiError("Order not found.", 404);
  }
  const row = order as {
    id: string;
    status: string;
    rider_id?: string | null;
  };
  if (row.status !== "delivered") {
    return apiError("ডেলিভারি সম্পন্ন হলে তারপর রেটিং দেওয়া যাবে।", 409);
  }
  const riderId = row.rider_id;
  if (!riderId) return apiError("রেটিং রেকর্ড করা যায়নি।", 409);

  const { error } = await service.from("delivery_ratings").insert({
    order_id: row.id,
    rider_id: riderId,
    stars,
  });
  if (error) {
    // 23505 = already rated this order → idempotent success, never an error.
    if (error.code === "23505") return apiJson({ ok: true, already: true });
    return apiError("রেটিং রেকর্ড করা যায়নি — আবার চেষ্টা করুন।", 503);
  }
  await applyDeliveryRating(service, riderId);
  return apiJson({ ok: true, already: false });
}
