/**
 * B1 (2026-09-28) — POST   /api/shop-follow — "tell me when this shop has something new"
 *                    DELETE /api/shop-follow — stop following
 *
 * The sibling of /api/stock-watch, one level up: shop-wide instead of one
 * product. Rate-limited per IP; the number is normalized + format-checked
 * here, and the row is written with the service role.
 */

import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { createShopFollow, deleteShopFollow } from "@/lib/db/growth";
import { validateShopFollow } from "@/lib/shop-follow";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 12;

const guard = (ip: string) => {
  const bucket = checkRateLimit(`shop-follow:${ip}`, LIMIT, WINDOW_MS);
  if (bucket.allowed) return null;
  const res = apiError("Too many attempts — please wait a moment.", 429);
  res.headers.set("Retry-After", String(bucket.retryAfterSec));
  return res;
};

export async function POST(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const checked = validateShopFollow(body);
  if (!checked.ok) {
    return apiError(
      checked.errors.phone ?? checked.errors.shopId ?? "That does not look right.",
      422,
      { fields: checked.errors },
    );
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Could not save the follow — please try again.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Could not save the follow — please try again.", 503);
  try {
    await createShopFollow(db, checked.value);
    return apiJson({ following: true as const }, 201);
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    return apiError("Could not save the follow — please try again.", 503);
  }
}

export async function DELETE(request: Request) {
  const limited = guard(clientIpFromHeaders(request.headers));
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const checked = validateShopFollow(body);
  if (!checked.ok) {
    return apiError(
      checked.errors.phone ?? checked.errors.shopId ?? "That does not look right.",
      422,
      { fields: checked.errors },
    );
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Could not stop the follow — please try again.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Could not stop the follow — please try again.", 503);
  try {
    await deleteShopFollow(db, checked.value);
    return apiJson({ following: false as const });
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    return apiError("Could not stop the follow — please try again.", 503);
  }
}
