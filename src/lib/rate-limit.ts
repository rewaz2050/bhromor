/**
 * Minimal in-memory rate limiter for public write/lookup routes.
 *
 * Honest scope: on serverless hosting each instance keeps its own bucket,
 * so this blunts casual abuse/double-submits but is NOT a DDoS defence.
 * Real edge rate-limiting (Vercel/Upstash) arrives with the hardening pass.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSec: number;
}

/**
 * Fixed-window check. Pure enough to unit test via injectable `now`.
 * Callers pass a key like `orders:<ip>` plus their own limit/window.
 */
export const checkRateLimit = (
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitDecision => {
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
};

/** Test-only escape hatch — the server never resets buckets by hand. */
export const __resetRateLimits = (): void => {
  buckets.clear();
};

/** Best-effort client IP for bucketing (Vercel/proxy aware).
 *
 * Security fix (2026-10-14, M1): the LEFTMOST `x-forwarded-for` entry is
 * attacker-controlled — proxies APPEND the real client IP to the right, so
 * a request with `X-Forwarded-For: 1.2.3.4` used to mint a fresh rate-limit
 * bucket on every call. Order of trust:
 *   1. `x-real-ip` — overwritten by the platform proxy (Vercel sets it).
 *   2. RIGHTMOST x-forwarded-for entry — the hop our own proxy appended.
 *   3. "unknown" — one shared bucket, never a per-request spoofable one.
 */
export const clientIpFromHeaders = (headers: Headers): string => {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
};
