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

/** Best-effort client IP for bucketing (Vercel/proxy aware). */
export const clientIpFromHeaders = (headers: Headers): string =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  headers.get("x-real-ip")?.trim() ||
  "unknown";
