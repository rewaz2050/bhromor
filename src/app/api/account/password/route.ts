/**
 * POST /api/account/password — change MY password (security 2026-10-14, M6).
 *
 * Body: { current, next }. Identity always comes from the session cookie.
 * On success every OTHER session is revoked (cookie-auth theft dies with the
 * old password); the caller's own session survives so the tab stays signed in.
 * New passwords follow the signup policy (8+ chars, common-password denylist).
 */

import {
  resolveCustomer,
  verifyPassword,
  hashPassword,
  checkNewPassword,
  CustomerAuthError,
  tokenFromRequest,
} from "@/lib/customer-auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Browser writes must be same-origin — the cookie rides every fetch.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return apiError("Forbidden", 403);
  }
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  if (!checkRateLimit(`customer-password:${customer.id}`, 5, 60_000).allowed) {
    return apiError("একটু পরে চেষ্টা করুন।", 429);
  }
  if (!isServiceRoleConfigured()) {
    return apiError("পাসওয়ার্ড বদলানো যাচ্ছে না — পরে আবার চেষ্টা করুন।", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("পাসওয়ার্ড বদলানো যাচ্ছে না — পরে আবার চেষ্টা করুন।", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }

  try {
    const current = typeof body.current === "string" ? body.current : "";
    const next = checkNewPassword(body.next);

    const found = await db
      .from("customers")
      .select("password_hash")
      .eq("id", customer.id)
      .maybeSingle();
    const stored = (found.data as { password_hash?: string } | null)?.password_hash ?? "";
    if (!stored || !verifyPassword(current, stored)) {
      throw new CustomerAuthError("বর্তমান পাসওয়ার্ড মিলছে না।", 401);
    }
    if (verifyPassword(next, stored)) {
      throw new CustomerAuthError("নতুন পাসওয়ার্ড আগেরটির মতোই — অন্য একটি দিন।", 422);
    }

    const updated = await db
      .from("customers")
      .update({ password_hash: hashPassword(next) })
      .eq("id", customer.id)
      .select("id")
      .single();
    if (updated.error || !updated.data) {
      throw new CustomerAuthError("পাসওয়ার্ড বদলানো গেল না — আবার চেষ্টা করুন।", 500);
    }

    // Revoke every other session — this one stays.
    const keep = tokenFromRequest(request);
    const keepHash = keep ? createHash("sha256").update(keep).digest("hex") : "";
    let purge = db.from("customer_sessions").delete().eq("customer_id", customer.id);
    if (keepHash) purge = purge.neq("token", keepHash);
    await purge;

    return apiJson({ ok: true });
  } catch (err) {
    if (err instanceof CustomerAuthError) {
      return apiError(err.message, err.status);
    }
    return apiError("পাসওয়ার্ড বদলানো গেল না — আবার চেষ্টা করুন।", 500);
  }
}
