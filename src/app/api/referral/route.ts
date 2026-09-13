/**
 * GET /api/referral — this account's share card (P0 #7).
 *
 * Returns the code, a ready-made share link and the ledger: how many friends
 * used it, how many ৳50 rewards have actually been banked (a reward is earned
 * when the friend's order is DELIVERED, not when it is placed) and the coupon
 * codes waiting to be spent.
 *
 * Signed-in only, on purpose: ৳50 for you means ৳50 to a real account that
 * brought a real order — an anonymous code anyone could mint is a coupon farm.
 * A shopper without an account still gets their ৳50 off as a friend; they just
 * need an account to earn one.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { ensureReferralCode, referralSummary } from "@/lib/db/growth";
import { readOpsSettings } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { displayRefCode, referralLink } from "@/lib/referral";
import { siteBaseUrl } from "@/lib/site-url";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`referral:${ip}`, 30, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  const customer = await resolveCustomer(request);
  if (!customer) {
    return apiError("Sign in to share your code and earn ৳50.", 401, {
      signIn: true,
    });
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Referral rewards are unavailable right now.", 503);
  }
  const db = getSupabaseService();
  if (!db) return apiError("Referral rewards are unavailable right now.", 503);
  try {
    const settings = await readOpsSettings(db);
    const code = await ensureReferralCode(db, customer);
    const summary = settings.referral.enabled
      ? await referralSummary(db, code)
      : {
          code,
          invited: 0,
          rewarded: 0,
          creditedPaisa: 0,
          pending: 0,
          coupons: [],
        };
    return apiJson({
      display: displayRefCode(code),
      path: referralLink("", code),
      link: referralLink(siteBaseUrl(), code),
      paused: !settings.referral.enabled,
      minOrderPaisa: settings.referral.minOrderPaisa,
      friendRewardPaisa: settings.referral.friendRewardPaisa,
      referrerRewardPaisa: settings.referral.referrerRewardPaisa,
      maxRewards: settings.referral.maxRewardsPerReferrer,
      ...summary,
    });
  } catch {
    return apiError("Referral rewards are unavailable right now.", 503);
  }
}
