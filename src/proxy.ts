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
  // Skip pure-static editorial content and Next data routes — no auth, no limit.
  if (
    STATIC_PROXY_SKIP.has(pathname) ||
    pathname.startsWith("/_next/data/")
  ) {
    return updateSupabaseSession(request);
  }
  const limited = await distributedRateLimit(request);
  if (limited) return limited;
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
