/**
 * GET/POST /api/account/threads — the shopper's side of the conversation.
 *
 * GET lists the threads on the session phone. POST opens one about an order;
 * the shop is taken from the order row, never from the request, so a shopper
 * cannot open a thread in a shop they never bought from.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { listThreads, openThread } from "@/lib/db/customer-threads";
import { normalizePhone } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const { threads, reason } = await listThreads(db, { phone: normalizePhone(customer.phone) });
  return apiJson({ threads, reason: reason ?? null });
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return apiError("Forbidden", 403);
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  if (!checkRateLimit(`threads-open:${customer.id}`, 10, 60_000).allowed) {
    return apiError("একটু পরে আবার চেষ্টা করুন।", 429);
  }
  const body = (await request.json().catch(() => null)) as {
    orderNo?: unknown;
    body?: unknown;
  } | null;
  const orderNo =
    typeof body?.orderNo === "string" ? body.orderNo.trim().toUpperCase().slice(0, 32) : "";
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (orderNo === "") return apiError("অর্ডার নম্বর দিন।", 422);
  if (text.length < 2) return apiError("একটু বিস্তারিত লিখুন।", 422);

  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const { threadId, reason } = await openThread(db, {
    phone: normalizePhone(customer.phone),
    orderNo,
    body: text,
    senderName: customer.name,
  });
  if (reason === "missing_table") return apiJson({ opened: false, reason }, 501);
  if (reason !== "saved" || !threadId) return apiError("বার্তা পাঠানো যায়নি।", 503);
  return apiJson({ opened: true, threadId });
}
