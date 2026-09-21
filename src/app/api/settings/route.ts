/**
 * GET /api/settings — the shop's ops settings for CUSTOMER surfaces.
 *
 * Checkout, the bag's cash-at-the-door card and the arrival cue all need the
 * owner's real numbers (surcharge toggles + amounts, courier floor, referral
 * rewards, wallet numbers…). Until now only staff sessions could read those,
 * so customers silently got launch defaults — the owner toggled "night
 * surcharge off" and the checkout kept charging it. This is the fix: the
 * same sanitized document the admin writes, read-only, nothing secret in it
 * (no keys, no internal ids — it's the shop's public pricing policy).
 */

import { readOpsSettings } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { sanitizeSettings, SETTINGS_DEFAULTS } from "@/lib/settings-store";
import { getSupabaseService } from "@/lib/supabase-server";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`settings:${ip}`, 60, 60_000);
  if (!bucket.allowed) {
    return NextResponse.json({ settings: SETTINGS_DEFAULTS }, {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ settings: SETTINGS_DEFAULTS }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const db = getSupabaseService();
  if (!db) {
    return NextResponse.json({ settings: SETTINGS_DEFAULTS }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const settings = sanitizeSettings(await readOpsSettings(db));
    return NextResponse.json({ settings }, {
      status: 200,
      // Short shared cache — a pricing change lands within a minute, and
      // checkout revalidates on every mount anyway.
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ settings: SETTINGS_DEFAULTS }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
