/**
 * Shared wrapper for /api/rider/* routes: rider verification, per-rider
 * rate limiting, and honest error mapping. Mirrors /api/vendor/_lib.ts.
 */

import { NextResponse } from "next/server";
import {
  requireRider,
  RiderAuthError,
  type RiderContext,
} from "@/lib/rider-auth";
import { RiderInputError } from "@/lib/db/riders";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";

export type RiderHandler = (
  ctx: RiderContext,
  request: Request,
  routeContext?: unknown,
) => Promise<NextResponse>;

/** Dynamic [id] params arrive as a promise in this Next version. */
export const routeId = async (context: unknown): Promise<string> => {
  const params = (context as { params?: Promise<{ id?: string }> })?.params;
  const resolved = params ? await params : undefined;
  return (resolved?.id ?? "").trim().slice(0, 64);
};

export const riderRoute = (
  name: string,
  handler: RiderHandler,
  opts: { limit?: number; windowMs?: number } = {},
) => {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  return async (request: Request, routeContext?: unknown): Promise<NextResponse> => {
    let rider: RiderContext;
    try {
      rider = await requireRider();
    } catch (err) {
      if (err instanceof RiderAuthError) {
        return apiError(err.message, err.status);
      }
      return apiError("Rider check failed.", 503);
    }
    const bucket = checkRateLimit(
      `rider:${name}:${rider.user.id}`,
      limit,
      windowMs,
    );
    if (!bucket.allowed) {
      const res = apiError("Too many requests — slow down a moment.", 429);
      res.headers.set("Retry-After", String(bucket.retryAfterSec));
      return res;
    }
    try {
      return await handler(rider, request, routeContext);
    } catch (err) {
      if (err instanceof RiderInputError) {
        return apiError(err.message, err.status);
      }
      return apiError(
        err instanceof Error ? err.message : "Something went wrong — please try again.",
        422,
      );
    }
  };
};
