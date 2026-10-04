/**
 * POST /api/track/rate/feedback — after rating, the customer says WHY (quick
 * reason tags + optional words) (item X, 202610020009).
 *
 * Same proof as /api/track/rate: the order number + the phone it was placed
 * with. One feedback per rated order; a low rating or a complaint tag rings
 * the staff bell at once (best-effort — never fails the customer's request).
 */

import { notifyStaff } from "@/lib/db/engagement";
import { saveDeliveryFeedback } from "@/lib/db/delivery-feedback";
import { findOwnedOrder } from "@/lib/db/order-lookup";
import { needsStaffAttention, parseFeedbackInput, feedbackSummary } from "@/lib/delivery-feedback";
import { isServiceRoleConfigured } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { checkDurableRateLimit } from "@/lib/rate-limit-durable";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return apiError("Forbidden", 403);
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkDurableRateLimit(`track-feedback:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — এক মিনিট পরে চেষ্টা করুন।", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }
  const service = getSupabaseService();
  if (!isServiceRoleConfigured() || !service) return apiError("মতামত সাময়িকভাবে বন্ধ আছে।", 503);

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; phone?: unknown; tags?: unknown; comment?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!id || !phone) return apiError("Order ID ও ফোন নম্বর দিন।", 400);
  const parsed = parseFeedbackInput(body);
  if (!parsed.ok) return apiError(parsed.error, 422);

  const order = await findOwnedOrder(service, id, phone, "id,status,rider_id,customer_phone");
  if (!order) return apiError("Order not found.", 404);
  const row = order as { id: string; status: string };
  if (row.status !== "delivered") return apiError("ডেলিভারি সম্পন্ন হলে তারপর মতামত দেওয়া যাবে।", 409);

  let result;
  try {
    result = await saveDeliveryFeedback(service, row.id, parsed.input);
  } catch {
    return apiError("মতামত রেকর্ড করা যায়নি — আবার চেষ্টা করুন।", 503);
  }
  switch (result.status) {
    case "unavailable":
      return apiError("মতামত সাময়িকভাবে বন্ধ আছে।", 503);
    case "no-rating":
      return apiError("আগে স্টার রেটিং দিন।", 409);
    case "already":
      return apiJson({ ok: true, already: true });
    case "saved": {
      if (needsStaffAttention(result.stars, parsed.input.tags)) {
        try {
          const { data: rider } = await service.from("riders").select("name").eq("id", result.riderId).maybeSingle();
          const name = (rider as { name?: string } | null)?.name ?? "a rider";
          await notifyStaff(service, {
            kind: "system",
            title: `${result.stars}★ delivery — ${name}`,
            body: `${id} · ${feedbackSummary({ tags: parsed.input.tags, comment: parsed.input.comment })}`.slice(0, 200),
            href: "/admin/riders/feedback",
          });
        } catch {
          // The feedback is saved; only the bell is lost.
        }
      }
      return apiJson({ ok: true, already: false });
    }
  }
}
