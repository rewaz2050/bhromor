/**
 * GET/POST /api/account/threads/:id — one conversation, shopper's side.
 *
 * Opening it marks it read, which is what the unread count in the list is
 * measured against. Posting is refused on a closed thread: the shop answered,
 * the shopper read it, and a stale thread that still accepts messages is how
 * an inbox fills with things nobody will see.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  appendMessage,
  canReadThread,
  markThreadRead,
  threadMessages,
} from "@/lib/db/customer-threads";
import { normalizePhone } from "@/lib/orders";

export const dynamic = "force-dynamic";

const threadId = async (context: { params?: Promise<{ id?: string }> }): Promise<string> => {
  const params = await context.params;
  return (params?.id ?? "").trim();
};

export async function GET(request: Request, context: { params?: Promise<{ id?: string }> }) {
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  const id = await threadId(context);
  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const phone = normalizePhone(customer.phone);
  if (!(await canReadThread(db, id, { phone }))) return apiError("এই বার্তাটি পাওয়া যায়নি।", 404);
  const { messages, reason } = await threadMessages(db, id);
  if (reason) return apiJson({ messages: [], reason }, reason === "missing_table" ? 501 : 503);
  await markThreadRead(db, id);
  return apiJson({ messages });
}

export async function POST(request: Request, context: { params?: Promise<{ id?: string }> }) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return apiError("Forbidden", 403);
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  if (!checkRateLimit(`threads-reply:${customer.id}`, 20, 60_000).allowed) {
    return apiError("একটু পরে আবার চেষ্টা করুন।", 429);
  }
  const id = await threadId(context);
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (text.length < 1) return apiError("খালি বার্তা পাঠানো যায় না।", 422);

  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const phone = normalizePhone(customer.phone);
  if (!(await canReadThread(db, id, { phone }))) return apiError("এই বার্তাটি পাওয়া যায়নি।", 404);
  const outcome = await appendMessage(db, id, "customer", customer.name, text);
  if (outcome === "missing_table") return apiJson({ sent: false, reason: outcome }, 501);
  if (outcome !== "saved") return apiError("বার্তা পাঠানো যায়নি।", 503);
  // Their own reply is read the moment they send it.
  await markThreadRead(db, id);
  return apiJson({ sent: true });
}
