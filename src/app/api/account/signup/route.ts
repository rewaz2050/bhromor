/**
 * POST /api/account/signup — create a customer account, instantly signed in.
 * No email/OTP verification by design: response sets the session cookie.
 * Demo mode returns `{ demoMode: true }` and the browser-local store takes over.
 * An unseeded accounts store (migration not applied yet) also degrades to
 * demo mode — the customer still gets a working account, the owner gets a
 * clear pointer in the server log instead of a silent 500.
 */

import {
  signupCustomer,
  createSession,
  sessionCookie,
  CustomerAuthError,
} from "@/lib/customer-auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`signup:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    const res = apiError("অনেকবার চেষ্টা হয়েছে — এক মিনিট পরে চেষ্টা করুন।", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }

  try {
    const customer = await signupCustomer({name: body.name, phone: body.phone, password: body.password});
    const { token, maxAgeSec } = await createSession(customer.id);
    const res = apiJson({ customer }, 201);
    res.headers.set("Set-Cookie", sessionCookie(token, maxAgeSec));
    return res;
  } catch (err) {
    if (err instanceof CustomerAuthError) {
      if (err.storeMissing) {
        console.error("[account/signup]", err.message);
        return apiJson({ demoMode: true as const });
      }
      return apiError(err.message, err.status);
    }
    return apiError("অ্যাকাউন্ট খোলা গেল না — আবার চেষ্টা করুন।", 500);
  }
}
