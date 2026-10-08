/**
 * The server half of the promo state (flicker pass 2026-10-07).
 *
 * The storefront layout reads this once per request and hands it to the
 * client store, so the flash bar, the campaign strip and every flash price
 * are in the first paint instead of arriving a beat later and pushing the
 * page down. `/api/promo` reads the same function, so the two answers can
 * never drift.
 *
 * Cached like every other public storefront read (`CACHE_TAG_OPS`, one
 * minute) — the promo document is identical for every visitor, and a staff
 * edit calls `revalidateCatalogCaches(CACHE_TAG_OPS)` so the next request
 * rebuilds it instead of waiting out the TTL. Without this the seed would
 * add a database round trip to every page view; the client fetch it replaces
 * was CDN-cached for the same minute.
 */

import "server-only";

import { unstable_cache } from "next/cache";
import { CAMPAIGN_DEFAULTS, campaignView } from "../campaign";
import { PROMO_DEFAULTS, promoView } from "../promos";
import { isServiceRoleConfigured } from "../env";
import { readOpsSettings } from "./engagement";
import { getSupabaseService } from "../supabase-server";
import { CACHE_TAG_OPS, PUBLIC_CACHE_SECONDS } from "../public-cache";
import type { PromoSeed } from "../promo-store";

const readSeed = async (): Promise<PromoSeed> => {
  const now = Date.now();
  const off: PromoSeed = {
    promos: promoView(PROMO_DEFAULTS, now),
    campaign: campaignView(CAMPAIGN_DEFAULTS, now),
    live: false,
  };
  // Unconfigured backend → an honest "nothing is running", never a stale
  // cached sale.
  if (!isServiceRoleConfigured()) return off;
  const db = getSupabaseService();
  if (!db) return off;
  const settings = await readOpsSettings(db);
  return {
    promos: promoView({ flash: settings.flash, bundle: settings.bundle }, now),
    campaign: campaignView(settings.campaign ?? CAMPAIGN_DEFAULTS, now),
    live: true,
  };
};

/**
 * `unstable_cache` is not available in every context (tests, CLI scripts) —
 * caching is an optimisation, never a correctness dependency, so fall back
 * to the direct read.
 */
const cachedSeed = unstable_cache(async () => readSeed(), ["promo-seed-v1"], {
  revalidate: PUBLIC_CACHE_SECONDS,
  tags: [CACHE_TAG_OPS],
});

export const readPromoSeed = async (): Promise<PromoSeed> => {
  try {
    return await cachedSeed();
  } catch {
    return readSeed();
  }
};
