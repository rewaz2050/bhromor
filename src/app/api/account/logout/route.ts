/**
 * POST /api/account/logout — delete the session row + clear the cookie.
 */

import { destroySession, clearedCookie } from "@/lib/customer-auth";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await destroySession(request);
  const res = apiJson({ ok: true });
  res.headers.set("Set-Cookie", clearedCookie());
  return res;
}
