/**
 * POST   /api/price-watch — "call me when this gets cheaper" (P0 #5)
 * DELETE /api/price-watch — stop watching
 *
 * One row per (product, phone). The list is staff work, not an automation:
 * there is no SMS/email sender in this stack, so the promise to the shopper is
 * a call from the shop — which is exactly how PROSANTI already confirms orders.
 * Rate-limited per IP, and the number is normalized + format-checked here, not
 * in the browser.
 */

import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { createPriceWatch, deletePriceWatch } from "@/lib/db/growth";
import { validateWatch } from "@/lib/price-drop";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 12;

const guard = (ip: string) => {
  const bucket = checkRateLimit(`price-watch:${ip}`, LIMIT, WINDOW_MS);
  if (bucket.allowed) return null;
  const res = apiError("Too many attempts — please wait a moment.", 429);
  res.headers.set("Retry-After", String(bucket.retryAfterSec));
  return res;
};

export async function POST(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const checked = validateWatch(body);
  if (!checked.ok) {
    return apiError(
      checked.errors.phone ?? checked.errors.productId ?? "That does not look right.",
      422,
      { fields: checked.errors },
    );
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Could not save the alert — please try again.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Could not save the alert — please try again.", 503);
  try {
    await createPriceWatch(db, checked.value);
    return apiJson({ watching: true as const }, 201);
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    return apiError("Could not save the alert — please try again.", 503);
  }
}

export async function DELETE(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const checked = validateWatch(body);
  if (!checked.ok) {
    return apiError(checked.errors.productId ?? "Nothing to remove.", 422);
  }
  if (!isServiceRoleConfigured()) return apiError("Could not update the alert.", 503);
  const db = getSupabaseService();
  if (!db) return apiError("Could not update the alert.", 503);
  try {
    await deletePriceWatch(db, checked.value);
    return apiJson({ watching: false as const });
  } catch {
    return apiError("Could not update the alert — please try again.", 503);
  }
}
