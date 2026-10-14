/**
 * POST /api/account/signup — create a customer account, instantly signed in.
 * No email/OTP verification by design. An unseeded accounts store (migration
 * not applied yet) answers 503 with a clear pointer in the server log.
 *
 * Security 2026-10-14 (M2): the response is IDENTICAL whether or not the
 * phone already had an account — `202 { ok: true }`, session cookie only
 * when a new account was actually created. The client decides what to show
 * by probing /api/account/me, so a signup probe cannot enumerate which
 * phone numbers hold accounts. Signup also spends one scrypt on the
 * already-exists path (see signupCustomer) to keep timing flat.
 */

import {
  signupCustomer,
  createSession,
  sessionCookie,
  CustomerAuthError,
} from "@/lib/customer-auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { checkDurableRateLimit } from "@/lib/rate-limit-durable";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkDurableRateLimit(`signup:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — এক মিনিট পরে চেষ্টা করুন।", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isServiceRoleConfigured()) {
    return apiError("অ্যাকাউন্ট খোলা যাচ্ছে না — পরে আবার চেষ্টা করুন।", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }

  // Per-phone budget (H5/M6): slows both signup spam and phone probing.
  const phoneKey = typeof body.phone === "string" ? body.phone.trim().slice(-11) : "x";
  const phoneLimit = await checkDurableRateLimit(`signup-phone:${phoneKey}`, 5, 15 * 60_000);
  if (!phoneLimit.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — একটু পরে আবার চেষ্টা করুন।", 429);
    res.headers.set("Retry-After", String(phoneLimit.retryAfterSec));
    return res;
  }

  try {
    const { customer, created } = await signupCustomer({
      name: body.name,
      phone: body.phone,
      password: body.password,
    });
    if (created && customer) {
      const { token, maxAgeSec } = await createSession(customer.id);
      const res = apiJson({ ok: true }, 202);
      res.headers.set("Set-Cookie", sessionCookie(token, maxAgeSec));
      return res;
    }
    // Already existed: same body, no cookie — never say which it was.
    return apiJson({ ok: true }, 202);
  } catch (err) {
    if (err instanceof CustomerAuthError) {
      if (err.storeMissing) {
        console.error("[account/signup]", err.message);
        return apiError("অ্যাকাউন্ট খোলা যাচ্ছে না — accounts store এখনো সেটআপ হয়নি।", 503);
      }
      return apiError(err.message, err.status);
    }
    return apiError("অ্যাকাউন্ট খোলা গেল না — আবার চেষ্টা করুন।", 500);
  }
}
