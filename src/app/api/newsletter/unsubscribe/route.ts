/**
 * GET /api/newsletter/unsubscribe?token=… — one-click unsubscribe.
 *
 * The token is the per-subscriber uuid staff can copy from the newsletter
 * page; it flips that row to unsubscribed. Unknown tokens 404 — silently
 * accepting them would lie about the list state.
 */

import { unsubscribeNewsletter } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`newsletter-unsub:${ip}`, 20, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Could not update the signup — please try again.", 503);
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const db = getSupabaseService();
    if (!db) return apiError("Could not update the signup — please try again.", 503);
    const ok = await unsubscribeNewsletter(db, token);
    if (!ok) return apiError("That signup link is unknown.", 404);
    return apiJson({ unsubscribed: true as const });
  } catch {
    return apiError("Could not update the signup — please try again.", 503);
  }
}
