/**
 * POST /api/newsletter/subscribe — table-based signup (no third party).
 *
 * Live: { email } → newsletter_subscribers row (re-subscribing a known
 * address just flips it back to subscribed). Demo mode answers
 * { demoMode: true } after validating — the footer never pretends a
 * local click subscribes anyone.
 */

import { notifyStaff, subscribeNewsletter } from "@/lib/db/engagement";
import { cleanEmail, isPlausibleEmail } from "@/lib/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`newsletter:${ip}`, 10, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid signup.", 400);
  }
  const email = cleanEmail((body as Record<string, unknown> | null)?.email);
  if (!isPlausibleEmail(email)) {
    return apiError("Enter a valid email address.", 422);
  }
  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const });
  }
  try {
    const db = getSupabaseService();
    if (!db) return apiJson({ demoMode: true as const });
    const { created } = await subscribeNewsletter(db, email);
    if (created) {
      await notifyStaff(db, {
        kind: "system",
        title: "New newsletter signup",
        body: `${email} joined the list.`,
        href: "/admin/newsletter",
      });
    }
    return apiJson({ subscribed: true as const });
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      const status =
        typeof (err as { status?: unknown }).status === "number"
          ? ((err as { status: number }).status as number)
          : 503;
      return apiError(err.message, status);
    }
    return apiError("Could not save the signup — please try again.", 503);
  }
}
