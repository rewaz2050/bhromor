/**
 * GET /api/promo — the live promo state the storefront renders with.
 *
 * One small public read of the ops document through the service-role client:
 * the flash window, the countdown deadline and the bundle rule. Nothing
 * staff-only is in the payload (see `promoView`), and the checkout does NOT
 * trust this answer — it re-reads the same settings server-side and recomputes
 * every taka (see lib/order-validation.ts).
 *
 * Unconfigured backend → an honest "nothing is running" (flash off), never a
 * stale cached sale.
 */

import { PROMO_DEFAULTS, promoView } from "@/lib/promos";
import { CAMPAIGN_DEFAULTS, campaignView } from "@/lib/campaign";
import { readOpsSettings } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { publicJson } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const off = promoView(PROMO_DEFAULTS, Date.now());
  if (!isServiceRoleConfigured())
    return apiJson({ source: "none", promos: off, campaign: campaignView(CAMPAIGN_DEFAULTS) });
  const db = getSupabaseService();
  if (!db) return apiJson({ source: "none", promos: off });
  const settings = await readOpsSettings(db);
  // Edge-cached 60 s (speed pass): identical for every visitor, and the
  // checkout recomputes every taka server-side, so a ≤60 s stale flag can
  // never mist-price an order. Unconfigured fallbacks above stay no-store.
  return publicJson({
    source: "live",
    promos: promoView({ flash: settings.flash, bundle: settings.bundle }, Date.now()),
    // P2 #20 — the campaign state rides the same poll, so the strip and the
    // landing flip teaser→live→ended without a reload, at the exact minute.
    campaign: campaignView(settings.campaign ?? CAMPAIGN_DEFAULTS, Date.now()),
  });
}
