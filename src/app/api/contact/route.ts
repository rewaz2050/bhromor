/**
 * /api/contact — the shop's contact surface.
 *
 * POST — public contact-message intake: validates → stores a row in
 * contact_messages → fans a notice to the staff inbox. Unconfigured
 * backends answer 503 after validating so the form behaves identically.
 *
 * GET — the shop's real contact channels (phone / WhatsApp / email) from
 * the ops settings. Every value is either a number the shop actually saved
 * or null — the storefront renders a channel only when it is configured, so
 * a visitor never sees a placeholder phone or a made-up inbox. 503 when the
 * backend is unconfigured; the pages then show only what can be real.
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

export async function GET() {
  const db = getSupabaseService();
  if (!db) return apiError("Contact details are temporarily unavailable.", 503);
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("value")
      .eq("key", "ops")
      .maybeSingle();
    if (error) return apiError("Contact details are temporarily unavailable.", 503);
    const ops = (data?.value ?? {}) as Record<string, unknown>;
    const contact = (ops.contact ?? {}) as Record<string, unknown>;
    const mobile = (v: unknown): string | null => {
      let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
      if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
      return BD_MOBILE.test(digits) ? digits : null;
    };
    const emailRaw =
      typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
    return apiJson({
      phone: mobile(contact.phone),
      whatsapp: mobile(contact.whatsapp) ?? mobile(contact.phone),
      email:
        emailRaw.length >= 5 &&
        emailRaw.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)
          ? emailRaw
          : null,
    });
  } catch {
    return apiError("Contact details are temporarily unavailable.", 503);
  }
}

const BD_MOBILE = /^01\d{9}$/;

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
      checked.errors.name ??
      checked.errors.phone ??
      checked.errors.message;
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
