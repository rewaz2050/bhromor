import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";

/**
 * Next 16 renamed the `middleware` file convention to `proxy` (the old name
 * still runs but logs a deprecation warning on every build — audit L3).
 * Same job as before: refresh the Supabase Auth cookie on each request so
 * the staff routes see the session the browser just created.
 *
 * Audit F-12 (2026-10-18): the matcher was very broad (every page + API);
 * static editorial pages never need auth/rate-limit work. An early return
 * here avoids the Upstash + Supabase round trips on those paths and on
 * Next data fetches (`/_next/data/*`), which previously hit the proxy too.
 */
const STATIC_PROXY_SKIP = new Set([
  "/about",
  "/story",
  "/contact",
  "/faq",
  "/delivery",
  "/returns",
  "/privacy",
  "/terms",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Phase 1A.2 (2026-10-18): per-request nonce for CSP — prep, not enforced yet.
  // The storefront CSP is still report-only (next.config.ts); the nonce is
  // exposed as `x-nonce` on request+response so layouts can add `nonce={...}`
  // to inline scripts before enforcement flips to `Content-Security-Policy`.
  // Staff surfaces already enforce CSP — they also receive the nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  request.headers.set("x-nonce", nonce);

  const withNonce = (res: Awaited<ReturnType<typeof updateSupabaseSession>>): Awaited<ReturnType<typeof updateSupabaseSession>> => {
    res.headers.set("x-nonce", nonce);
    return res;
  };

  // Skip pure-static editorial content and Next data routes — no auth, no limit.
  if (
    STATIC_PROXY_SKIP.has(pathname) ||
    pathname.startsWith("/_next/data/")
  ) {
    const res = await updateSupabaseSession(request);
    return withNonce(res);
  }
  const limited = await distributedRateLimit(request);
  if (limited) {
    // Rate-limited responses still carry the nonce for consistency.
    limited.headers.set("x-nonce", nonce);
    return limited;
  }
  const res = await updateSupabaseSession(request);
  return withNonce(res);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
