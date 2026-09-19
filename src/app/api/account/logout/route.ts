/**
 * POST /api/account/logout — delete the session row + clear the cookie.
 */

import { destroySession, clearedCookie } from "@/lib/customer-auth";
import { apiError, apiJson } from "@/lib/api-response";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Each call is a database delete keyed by the cookie; the only account route
// that had no limiter (audit L5). Generous — nobody signs out 30×/minute.
const WINDOW_MS = 60_000;
const LIMIT = 30;

export async function POST(request: Request) {
  const gate = checkRateLimit(
    `account-logout:${clientIpFromHeaders(request.headers)}`,
    LIMIT,
    WINDOW_MS,
  );
  if (!gate.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(gate.retryAfterSec));
    return res;
  }
  await destroySession(request);
  const res = apiJson({ ok: true });
  res.headers.set("Set-Cookie", clearedCookie());
  return res;
}
