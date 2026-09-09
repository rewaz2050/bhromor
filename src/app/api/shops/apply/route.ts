/**
 * POST /api/shops/apply — public shop application intake (slice 2).
 *
 * Creates a pending, closed row for the staff queue. Tight rate limit:
 * applications are rare and the endpoint writes to the database. Demo mode
 * answers { demoMode: true } after validating — the storefront form (slice 4)
 * records the draft in the browser-local demo store instead.
 */

import { ShopInputError, applyShop } from "@/lib/db/marketplace";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`shops-apply:${ip}`, 5, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid application.", 400);
  }
  if (!isServiceRoleConfigured()) {
    // Validate honestly even in demo so the form behaves identically.
    const b = (body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const email =
      typeof (b.email ?? b.contactEmail) === "string"
        ? String(b.email ?? b.contactEmail).trim()
        : "";
    if (name.length < 2) return apiError("Shop name is too short.", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("A valid contact email is required.", 400);
    }
    return apiJson({ demoMode: true as const });
  }
  try {
    // Signed-in applicants link their login to the application (slice 3):
    // the staff queue can approve straight into an active vendor account.
    let applicantUserId: string | undefined;
    try {
      const session = await getSupabaseServer();
      const { data } = (await session?.auth.getUser()) ?? { data: null };
      applicantUserId = data?.user?.id;
    } catch {
      applicantUserId = undefined;
    }
    const { id } = await applyShop(body, applicantUserId);
    return apiJson(
      {
        applied: true as const,
        id,
        linked: applicantUserId !== undefined,
        message:
          "Application received — we'll call you back after verification.",
      },
      201,
    );
  } catch (err) {
    if (err instanceof ShopInputError) {
      return apiError(err.message, err.status);
    }
    return apiError("Could not save the application.", 503);
  }
}
