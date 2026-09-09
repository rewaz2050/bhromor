/**
 * Shared wrapper for /api/admin/* routes: staff verification, per-staff
 * rate limiting, and honest error mapping. Route handlers stay thin.
 */

import { NextResponse } from "next/server";
import { requireStaff, requireStaffRole, StaffAuthError, type StaffContext, type StaffRole } from "@/lib/staff-auth";
import { AdminInputError } from "@/lib/db/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";

export type StaffHandler = (
  ctx: StaffContext,
  request: Request,
  routeContext?: unknown,
) => Promise<NextResponse>;

export const staffRoute = (
  name: string,
  handler: StaffHandler,
  opts: { limit?: number; windowMs?: number; roles?: readonly StaffRole[] } = {},
) => {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  return async (request: Request, routeContext?: unknown): Promise<NextResponse> => {
    let staff: StaffContext;
    try {
      staff =
        opts.roles && opts.roles.length > 0
          ? await requireStaffRole(...opts.roles)
          : await requireStaff();
    } catch (err) {
      if (err instanceof StaffAuthError) {
        return apiError(err.message, err.status);
      }
      return apiError("Staff check failed.", 503);
    }
    const bucket = checkRateLimit(`admin:${name}:${staff.user.id}`, limit, windowMs);
    if (!bucket.allowed) {
      const res = apiError("Too many requests — slow down a moment.", 429);
      res.headers.set("Retry-After", String(bucket.retryAfterSec));
      return res;
    }
    try {
      return await handler(staff, request, routeContext);
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
