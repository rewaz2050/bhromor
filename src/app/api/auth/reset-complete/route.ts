/**
 * POST /api/auth/reset-complete — set the new password inside an approved
 * reset window (2026-09-26; no SMS, no e-mail).
 *
 * Body {kind, email, phone, password}. Succeeds only while a staff-approved,
 * unused, unexpired request exists for exactly that email + phone pair;
 * then the request is closed (`used`). Tight per-IP limit: this endpoint
 * changes credentials.
 */

import { ApplicantAccountError } from "@/lib/db/applicant-account";
import {
  ResetRequestError,
  completeResetRequest,
  normalizeResetEmail,
  normalizeResetPhone,
  parseResetKind,
  resetRequestsReady,
} from "@/lib/db/password-reset";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`reset-complete:${ip}`, 5, 15 * 60_000);
  if (!bucket.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — একটু পরে আবার করুন।", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  const service = getSupabaseService();
  if (!service) return apiError("পাসওয়ার্ড রিসেট সার্ভিস এখনো চালু হয়নি — সাপোর্টে জানান।", 503);
  try {
    const fields = (body ?? {}) as Record<string, unknown>;
    const kind = parseResetKind(fields.kind);
    const email = normalizeResetEmail(fields.email);
    const phone = normalizeResetPhone(fields.phone);
    const password = typeof fields.password === "string" ? fields.password : "";
    if (!(await resetRequestsReady(service))) {
      return apiError("পাসওয়ার্ড রিসেট সার্ভিস এখনো চালু হয়নি — সাপোর্টে জানান।", 503);
    }
    await completeResetRequest(service, { kind, email, phone, password });
    return apiJson({ done: true as const, message: "পাসওয়ার্ড বদলে গেছে — এখন নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।" });
  } catch (err) {
    if (err instanceof ResetRequestError || err instanceof ApplicantAccountError) {
      return apiError(err.message, err.status);
    }
    return apiError("পাসওয়ার্ড বদলানো যায়নি — আবার চেষ্টা করুন।", 503);
  }
}
