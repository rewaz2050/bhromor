/**
 * /api/membership — PROSANTI+ (P2 #17), customer-facing.
 *
 * GET  ?phone=01XXXXXXXXX → { state, expiresAt } — deliberately the ONLY two
 *      facts about a phone: is it a member, until when. No names, no history,
 *      rate-limited per IP; checkout uses it to show the waiver before the
 *      customer pays, and the place-order RPC answers the same question from
 *      the same table when the money actually moves.
 *
 * POST { name, phone, months, payMethod, trxid } → files a pending
 *      application for the wallet money already sent. Amount is derived
 *      server-side from the configured price — a client cannot "pay" ৳9 for
 *      six months; staff match the TRXID against the wallet before approving.
 */

import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import { AdminInputError } from "@/lib/db/admin";
import { applyMembership, membershipStatusFor } from "@/lib/db/membership";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) return apiError("Membership is not available right now.", 503);
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`membership-get:${ip}`, 30, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many lookups — wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  const url = new URL(request.url);
  const db = getSupabaseService();
  if (!db) return apiError("Membership is not available right now.", 503);
  const status = await membershipStatusFor(db, url.searchParams.get("phone"));
  // The price + on/off are shop config, not personal data — the apply card
  // needs both to say what a month costs before the customer sends money.
  let pricePaisa = 0;
  let enabled = false;
  try {
    const { readOpsSettings } = await import("@/lib/db/engagement");
    const { sanitizePlus } = await import("@/lib/membership");
    const plus = sanitizePlus((await readOpsSettings(db)).plus);
    pricePaisa = plus.pricePaisa;
    enabled = plus.enabled;
  } catch {
    /* config read hiccup → the card shows "unavailable", not a lie */
  }
  return apiJson({ ...status, pricePaisa, enabled });
}

export async function POST(request: Request) {
  if (!isServiceRoleConfigured()) return apiError("Membership is not available right now.", 503);
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`membership-post:${ip}`, 6, 60_000);
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
  const db = getSupabaseService();
  if (!db) return apiError("Membership is not available right now.", 503);
  try {
    const out = await applyMembership(db, body);
    return apiJson(out, 201);
  } catch (err) {
    if (err instanceof AdminInputError) {
      return apiError(err.message, err.status ?? 422);
    }
    return apiError("Could not record the application — please try again.", 503);
  }
}
