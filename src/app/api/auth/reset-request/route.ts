/**
 * /api/auth/reset-request — password reset REQUESTS for vendor / rider
 * logins (2026-09-26; no SMS, no e-mail).
 *
 *   POST {kind, email, phone}  → files the request (idempotent while one is
 *                                open) and pings the staff inbox. 202.
 *   GET  ?kind=&email=&phone=  → the login page polls this: none · pending ·
 *                                approved (with the window end) · rejected
 *                                (with the staff note) · used · expired.
 *
 * Both need the email + phone pair that is on the shop / rider row, so the
 * status is never an oracle beyond what the requester already knew. The
 * service role does the lookups; a missing table (migration not applied)
 * answers 503 with a plain explanation.
 */

import { notifyStaff } from "@/lib/db/engagement";
import {
  ResetRequestError,
  createResetRequest,
  normalizeResetEmail,
  normalizeResetPhone,
  parseResetKind,
  resetRequestStatus,
  resetRequestsReady,
} from "@/lib/db/password-reset";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const NOT_READY = "পাসওয়ার্ড রিসেট সার্ভিস এখনো চালু হয়নি — সাপোর্টে জানান।";

const limited = (key: string, limit: number, windowMs: number) => {
  const bucket = checkRateLimit(key, limit, windowMs);
  if (bucket.allowed) return null;
  const res = apiError("অনেকবার চেষ্টা হয়েছে — একটু পরে আবার করুন।", 429);
  res.headers.set("Retry-After", String(bucket.retryAfterSec));
  return res;
};

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const ipLimit = limited(`reset-request:${ip}`, 5, 15 * 60_000);
  if (ipLimit) return ipLimit;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  const service = getSupabaseService();
  if (!service) return apiError(NOT_READY, 503);
  try {
    const fields = (body ?? {}) as Record<string, unknown>;
    const kind = parseResetKind(fields.kind);
    const email = normalizeResetEmail(fields.email);
    const phone = normalizeResetPhone(fields.phone);
    const emailLimit = limited(`reset-request:${kind}:${email}`, 3, 60 * 60_000);
    if (emailLimit) return emailLimit;
    if (!(await resetRequestsReady(service))) return apiError(NOT_READY, 503);

    const { request: status, subject, created } = await createResetRequest(service, {
      kind,
      email,
      phone,
      ip,
    });
    if (created) {
      await notifyStaff(service, {
        kind: "system",
        title: `Password reset request — ${subject.name || email}`,
        body: `${kind === "vendor" ? "Shop" : "Rider"} login ${email} (${phone}) asked for a password reset. Call the number on file, then approve in Admin → Access.`,
        href: "/admin/access",
      });
    }
    return apiJson({ ...status, created }, created ? 202 : 200);
  } catch (err) {
    if (err instanceof ResetRequestError) return apiError(err.message, err.status);
    return apiError("অনুরোধ জমা দেওয়া যায়নি — আবার চেষ্টা করুন।", 503);
  }
}

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const ipLimit = limited(`reset-status:${ip}`, 30, 60_000);
  if (ipLimit) return ipLimit;
  const service = getSupabaseService();
  if (!service) return apiError(NOT_READY, 503);
  try {
    const url = new URL(request.url);
    const kind = parseResetKind(url.searchParams.get("kind"));
    const email = normalizeResetEmail(url.searchParams.get("email"));
    const phone = normalizeResetPhone(url.searchParams.get("phone"));
    if (!(await resetRequestsReady(service))) return apiError(NOT_READY, 503);
    return apiJson(await resetRequestStatus(service, { kind, email, phone }));
  } catch (err) {
    if (err instanceof ResetRequestError) return apiError(err.message, err.status);
    return apiError("অবস্থা জানা যায়নি — আবার চেষ্টা করুন।", 503);
  }
}
