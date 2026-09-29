import { NextResponse, type NextRequest } from "next/server";

type Policy = { limit: number; windowMs: number };

const policyFor = (pathname: string): Policy => {
  if (/^\/api\/(?:account\/(?:login|signup)|auth\/reset-(?:request|complete))$/.test(pathname)) {
    return { limit: 10, windowMs: 15 * 60_000 };
  }
  if (pathname === "/api/orders") return { limit: 30, windowMs: 60_000 };
  if (pathname.startsWith("/api/vendor/staff")) return { limit: 8, windowMs: 60_000 };
  if (pathname.includes("/media/sign")) return { limit: 30, windowMs: 60_000 };
  return { limit: 240, windowMs: 60_000 };
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
};

const WINDOW_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; local ttl=redis.call('PTTL',KEYS[1]); if n>tonumber(ARGV[2]) then return {0,ttl}; else return {1,ttl}; end`;

/**
 * Shared edge/API limiter. Configure UPSTASH_REDIS_REST_URL + TOKEN to enable;
 * if the Redis service is unavailable, route-level limits remain as a fallback
 * so an external limiter outage does not take checkout offline.
 */
export async function distributedRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token || !request.nextUrl.pathname.startsWith("/api/")) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }

  let ip = request.headers.get("x-real-ip")?.trim();
  if (!ip) ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const { limit, windowMs } = policyFor(path);
  // Collapse attacker-controlled record ids so changing order/product IDs
  // cannot create a fresh bucket on every request.
  const routeKey = path
    .replace(/\/PS-[A-Z0-9-]+/gi, "/:order")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/[0-9]{6,}/g, "/:id");
  const key = `bhromor:edge-rl:${await sha256(`${routeKey}:${ip}`)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", WINDOW_SCRIPT, "1", key, String(windowMs), String(limit)]),
      cache: "no-store",
      signal: AbortSignal.timeout(900),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: unknown };
    const result = payload.result;
    if (!Array.isArray(result) || result.length < 2) return null;
    const allowed = Number(result[0]) === 1;
    if (allowed) return null;
    const retryAfter = Math.max(1, Math.ceil(Number(result[1]) / 1000) || 1);
    return NextResponse.json(
      { error: "Too many requests — slow down a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
    );
  } catch {
    return null;
  }
}
