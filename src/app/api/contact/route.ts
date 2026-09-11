/**
 * POST /api/contact — public contact-message intake.
 *
 * Live: validates → stores a row in contact_messages → fans a notice to
 * the staff inbox. Unconfigured backends answer 503 after validating
 * so the form behaves identically.
 * the message instead.
 */

import {
  createContactMessage,
  notifyStaff,
} from "@/lib/db/engagement";
import { validateContact } from "@/lib/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`contact:${ip}`, 5, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid message.", 400);
  }
  // Validate honestly before the backend check.
  const checked = validateContact(body);
  if (!checked.ok) {
    const first =
      checked.errors.name ?? checked.errors.phone ?? checked.errors.message;
    return apiError(first ?? "Invalid message.", 422, {
      fields: checked.errors,
    });
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Could not send the message — please try again.", 503);
  }
  try {
    const db = getSupabaseService();
    if (!db) return apiError("Could not send the message — please try again.", 503);
    const message = await createContactMessage(db, body);
    await notifyStaff(db, {
      kind: "system",
      title: `New message: ${message.topic}`,
      body: `${message.name} (${message.phone}) wrote from the contact page.`,
      href: "/admin/messages",
    });
    return apiJson({ sent: true as const });
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      const status =
        typeof (err as { status?: unknown }).status === "number"
          ? ((err as { status: number }).status as number)
          : 503;
      return apiError(err.message, status);
    }
    return apiError("Could not send the message — please try again.", 503);
  }
}
