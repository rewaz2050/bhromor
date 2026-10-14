/**
 * Shared gate for the public /api/track* lookups (security 2026-10-14, H3).
 *
 * Ownership proof:
 *   • order number (guessable) + the phone it was placed with, AND/OR
 *   • a signed `t` token from a link the server built (push/WA/receipt).
 *
 * A valid token IS full proof — links hand it out only after some other
 * proof (placement, push subscription, staff action) — so token callers get
 * the relaxed budget. The manual id+phone path keeps working but under the
 * strict, durable (cross-instance) limit, because order numbers are
 * guessable and phones are often public.
 */
import { checkDurableRateLimit } from "./rate-limit-durable";
import { clientIpFromHeaders } from "./rate-limit";
import { verifyTrackToken } from "./track-token";
import { apiError } from "./api-response";

export type TrackGate =
  | { allowed: true; tokenOk: boolean }
  | { allowed: false; response: Response };

export const gateTrackRequest = async (
  request: Request,
  opts: {
    /** Bucket name, e.g. "track", "track-cancel". */
    name: string;
    /** The order reference the caller presented (link value or typed). */
    id: string;
    phone: string;
    /** The signed token, when the link carried one. */
    token?: string | null;
    /** Per-IP/min budget WITHOUT a valid token. */
    limit: number;
    /** Per-IP/min budget WITH a valid token (default 4× the strict one). */
    tokenLimit?: number;
    windowMs?: number;
  },
): Promise<TrackGate> => {
  const ip = clientIpFromHeaders(request.headers);
  const tokenOk = verifyTrackToken(opts.id, opts.phone, opts.token);
  const limit = tokenOk ? (opts.tokenLimit ?? Math.max(opts.limit * 4, 60)) : opts.limit;
  const bucket = await checkDurableRateLimit(
    `${opts.name}:${ip}`,
    limit,
    opts.windowMs ?? 60_000,
  );
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return { allowed: false, response: res };
  }
  return { allowed: true, tokenOk };
};

/** Standard cross-site guard for the state-changing track routes. */
export const rejectCrossSite = (request: Request): boolean =>
  request.headers.get("sec-fetch-site") === "cross-site";
