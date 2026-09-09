/**
 * POST /api/riders/apply — public rider application intake (slice 6).
 *
 * Creates a pending row for the Admin → Riders queue. Tight rate limit:
 * applications are rare and the endpoint writes to the database. Demo mode
 * answers { demoMode: true } after validating.
 */

import { RiderInputError, applyRider } from "@/lib/db/riders";
import { notifyStaff } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseServer, getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`riders-apply:${ip}`, 5, 60_000);
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
    if (name.length < 2) return apiError("Rider name is too short.", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("A valid email is required.", 400);
    }
    return apiJson({ demoMode: true as const });
  }
  try {
    // Signed-in applicants link their login to the application:
    // the staff queue can approve straight into an active rider account.
    let applicantUserId: string | undefined;
    try {
      const session = await getSupabaseServer();
      const { data } = (await session?.auth.getUser()) ?? { data: null };
      applicantUserId = data?.user?.id;
    } catch {
      applicantUserId = undefined;
    }
    const { id } = await applyRider(body, applicantUserId);
    const staffDb = getSupabaseService();
    if (staffDb) {
      const riderName =
        typeof (body as Record<string, unknown>)?.name === "string"
          ? String((body as Record<string, unknown>).name).trim().slice(0, 80)
          : "A rider";
      await notifyStaff(staffDb, {
        kind: "system",
        title: "New rider application",
        body: `${riderName} applied to ride for PROSANTI.`,
        href: "/admin/riders",
      });
    }
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
    if (err instanceof RiderInputError) {
      return apiError(err.message, err.status);
    }
    return apiError("Could not save the application.", 503);
  }
}
