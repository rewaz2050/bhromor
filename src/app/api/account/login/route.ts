/**
 * POST /api/account/login — phone + password, session cookie on success.
 * Demo mode returns `{ demoMode: true }` (browser-local store handles it).
 */

import { loginCustomer, createSession, sessionCookie, CustomerAuthError } from "@/lib/customer-auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`login:${ip}`, 10, 60_000);
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
    const customer = await loginCustomer({phone: body.phone, password: body.password});
    const { token, maxAgeSec } = await createSession(customer.id);
    const res = apiJson({ customer });
    res.headers.set("Set-Cookie", sessionCookie(token, maxAgeSec));
    return res;
  } catch (err) {
    if (err instanceof CustomerAuthError) {
      return apiError(err.message, err.status);
    }
    return apiError("লগ ইন করা গেল না — আবার চেষ্টা করুন।", 500);
  }
}
