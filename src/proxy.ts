import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-middleware";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";

/**
 * Next 16 renamed the `middleware` file convention to `proxy` (the old name
 * still runs but logs a deprecation warning on every build — audit L3).
 * Same job as before: refresh the Supabase Auth cookie on each request so
 * the staff routes see the session the browser just created.
 */
export async function proxy(request: NextRequest) {
  const limited = await distributedRateLimit(request);
  if (limited) return limited;
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
