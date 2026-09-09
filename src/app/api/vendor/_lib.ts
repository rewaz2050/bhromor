/**
 * Shared wrapper for /api/vendor/* routes: vendor verification, per-vendor
 * rate limiting, and honest error mapping. Mirrors /api/admin/_lib.ts.
 */


import { NextResponse } from "next/server";
import { requireVendor, VendorAuthError, type VendorContext } from "@/lib/vendor-auth";
import { AdminInputError } from "@/lib/db/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";

export type VendorHandler = (
  ctx: VendorContext,
  request: Request,
  routeContext?: unknown,
) => Promise<NextResponse>;

export const vendorRoute = (
  name: string,
  handler: VendorHandler,
  opts: { limit?: number; windowMs?: number } = {},
) => {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  return async (request: Request, routeContext?: unknown): Promise<NextResponse> => {
    let vendor: VendorContext;
    try {
      vendor = await requireVendor();
    } catch (err) {
      if (err instanceof VendorAuthError) {
        return apiError(err.message, err.status);
      }
      return apiError("Vendor check failed.", 503);
    }
    const bucket = checkRateLimit(`vendor:${name}:${vendor.user.id}`, limit, windowMs);
    if (!bucket.allowed) {
      const res = apiError("Too many requests — slow down a moment.", 429);
      res.headers.set("Retry-After", String(bucket.retryAfterSec));
      return res;
    }
    try {
      return await handler(vendor, request, routeContext);
    } catch (err) {
      if (err instanceof AdminInputError) {
        return apiError(err.message, err.status);
      }
      return apiError("Something went wrong — please try again.", 503);
    }
  };
};

/** Dynamic [id] params arrive as a promise in this Next version. */
export const routeId = async (context: unknown): Promise<string> => {
  const params = (context as { params?: Promise<{ id?: string }> })?.params;
  const resolved = params ? await params : undefined;
  return (resolved?.id ?? "").trim().slice(0, 64);
};
