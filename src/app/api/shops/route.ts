/**
 * GET /api/shops?zone=<id> — public shop discovery (slice 2).
 *
 * Active shops only, optionally scoped to one delivery zone (area-scoped
 * discovery, D3). Contact emails are stripped before responding — the anon
 * key has no shop policies on purpose. An unconfigured backend answers 503.
 */

import { listPublicShops } from "@/lib/db/marketplace";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`shops:${ip}`, 60, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many requests — slow down a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  const url = new URL(request.url);
  const zone = url.searchParams.get("zone")?.trim() || undefined;

  try {
    const shops = await listPublicShops(zone);
    if (!shops) {
      return apiError("Shops are temporarily unavailable.", 503);
    }
    return apiJson({ source: "live" as const, shops });
  } catch {
    return apiError("Shops are temporarily unavailable.", 503);
  }
}
