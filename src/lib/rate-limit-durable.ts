/**
 * Durable rate limit (item P) — the shared-counter second opinion behind the
 * in-memory limiter, for the public routes an attacker would hammer
 * (login, signup, reset, orders, contact, applications, reviews, returns…).
 *
 * Why: the in-memory bucket is per serverless instance, so spreading requests
 * across instances multiplies the allowance. `ps_rate_limit_hit`
 * (202610020008) keeps ONE row per key that every instance increments.
 *
 * Rules:
 *   • The in-memory check runs first — a burst from one instance is refused
 *     without a database round trip.
 *   • It NEVER makes a request fail: no service role, migration not run, a
 *     slow or erroring database → the in-memory decision stands. A missing
 *     function is remembered for 5 minutes and any other error for 15 seconds
 *     (a circuit breaker), so a sick database does not add latency to every
 *     request.
 *   • The database call is bounded to 1.5 s.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, type RateLimitDecision } from "./rate-limit";

const CALL_TIMEOUT_MS = 1500;
const MISSING_BACKOFF_MS = 5 * 60_000;
const ERROR_BACKOFF_MS = 15_000;

let pausedUntil = 0;

const isMissingFunction = (e: { code?: string; message?: string }): boolean =>
  e.code === "42883" ||
  e.code === "PGRST202" ||
  /could not find the function|function .* does not exist/i.test(e.message ?? "");

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

export const checkDurableRateLimit = async (
  key: string,
  limit: number,
  windowMs: number,
  opts: { now?: number; service?: SupabaseClient | null } = {},
): Promise<RateLimitDecision> => {
  const now = opts.now ?? Date.now();
  const local = checkRateLimit(key, limit, windowMs, now);
  if (!local.allowed) return local;
  if (now < pausedUntil) return local;

  try {
    let service = opts.service;
    if (service === undefined) {
      const { getSupabaseService } = await import("./supabase-server");
      service = getSupabaseService();
    }
    if (!service) return local;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), CALL_TIMEOUT_MS);
    });
    const result = await Promise.race([
      Promise.resolve(service.rpc("ps_rate_limit_hit", { p_key: key, p_limit: limit, p_window_ms: windowMs })) as Promise<RpcResult>,
      timeout,
    ]).finally(() => clearTimeout(timer));

    if (result === "timeout") {
      pausedUntil = now + ERROR_BACKOFF_MS;
      return local;
    }
    if (result.error) {
      pausedUntil = now + (isMissingFunction(result.error) ? MISSING_BACKOFF_MS : ERROR_BACKOFF_MS);
      return local;
    }
    const row = (Array.isArray(result.data) ? result.data[0] : result.data) as
      | { allowed?: boolean; retry_after_sec?: number }
      | null
      | undefined;
    if (!row || typeof row.allowed !== "boolean") return local;
    return {
      allowed: row.allowed,
      retryAfterSec: Math.max(1, Number(row.retry_after_sec) || local.retryAfterSec),
    };
  } catch {
    pausedUntil = now + ERROR_BACKOFF_MS;
    return local;
  }
};

/** Test-only: forget the circuit breaker. */
export const __resetDurableRateLimit = (): void => {
  pausedUntil = 0;
};
