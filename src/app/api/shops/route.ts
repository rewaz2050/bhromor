/**
 * GET /api/shops?zone=<id> — public shop discovery (slice 2).
 *
 * Active shops only, optionally scoped to one delivery zone (area-scoped
 * discovery, D3). Contact emails are stripped before responding — the anon
 * key has no shop policies on purpose. Demo mode answers from seeds with
 * an explicit `source` label, like /api/products.
 */

import { listPublicShops, toPublicShop } from "@/lib/db/marketplace";
import { seedShops } from "@/lib/shops-store";
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
      const seeds = seedShops().map(toPublicShop);
      return apiJson({
        source: "demo" as const,
        shops: zone ? seeds.filter((s) => s.zoneIds.includes(zone)) : seeds,
      });
    }
    return apiJson({ source: "live" as const, shops });
  } catch {
    return apiError("Shops are temporarily unavailable.", 503);
  }
}
