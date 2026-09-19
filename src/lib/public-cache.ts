/**
 * Edge/CDN caching for the PUBLIC, identical-for-everyone reads
 * (audit 2026-09-17 P1.1 — "the real cost is round trips, not bytes").
 *
 * Dhaka → Vercel (iad1) → Supabase → back is ≈ 600–800 ms per uncached API
 * call. The storefront fires five of them before the product grid paints.
 * These five answers are the same for every visitor and change only when
 * staff edit the catalog, so they may live on Vercel's CDN for a minute and
 * be served stale for five more while a background refresh runs:
 *
 *   Cache-Control: public, s-maxage=60, stale-while-revalidate=300
 *
 * Only the CDN caches (`s-maxage`); the browser still revalidates (`max-age`
 * is 0), so a hard refresh always shows what the CDN has and admin edits
 * propagate within a minute at most — and immediately after
 * `revalidateCatalogCaches()` for the Next data cache (see below).
 *
 * Rules:
 *   - NEVER use this for anything that varies per user (orders, account,
 *     admin, rider, vendor) — those stay `no-store` via `apiJson`.
 *   - Error responses are never cached (a 503 "not seeded" must clear the
 *     moment the shop seeds products).
 *   - Vercel strips `s-maxage`/`stale-while-revalidate` from the header the
 *     browser sees; `CDN-Cache-Control` carries the same value so any CDN in
 *     front (Cloudflare on the custom domain) honours it too.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/** Seconds the CDN may serve the answer without asking the origin. */
export const PUBLIC_CACHE_SECONDS = 60;
/** Seconds a stale answer may still be served while revalidating. */
export const PUBLIC_STALE_SECONDS = 300;

export const PUBLIC_CACHE_CONTROL = `public, max-age=0, s-maxage=${PUBLIC_CACHE_SECONDS}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`;

const PUBLIC_HEADERS = {
  "Cache-Control": PUBLIC_CACHE_CONTROL,
  "CDN-Cache-Control": PUBLIC_CACHE_CONTROL,
} as const;

/** JSON 200 that the CDN may cache for a minute (public data only). */
export const publicJson = <T>(data: T): NextResponse<T> =>
  NextResponse.json(data, { status: 200, headers: { ...PUBLIC_HEADERS } });

/**
 * Next data-cache tags used by `unstable_cache` around the catalog reads.
 * Admin/vendor writes call `revalidateCatalogCaches()` so the next storefront
 * request rebuilds the catalog instead of waiting out the TTL.
 */
export const CACHE_TAG_CATALOG = "catalog";
export const CACHE_TAG_ZONES = "zones";
export const CACHE_TAG_SHOPS = "shops";
export const CACHE_TAG_HOMEPAGE = "homepage";
export const CACHE_TAG_OPS = "ops";

export type CatalogCacheTag =
  | typeof CACHE_TAG_CATALOG
  | typeof CACHE_TAG_ZONES
  | typeof CACHE_TAG_SHOPS
  | typeof CACHE_TAG_HOMEPAGE
  | typeof CACHE_TAG_OPS;

/**
 * Mark the given cache tags stale. `{ expire: 0 }` = the next read is a
 * blocking rebuild (staff expect their edit to show on the next reload, not
 * "within a minute"). Safe to call outside a request (tests, scripts): a
 * missing Next store is swallowed — caching is an optimisation, never a
 * correctness dependency.
 */
export const revalidateCatalogCaches = (
  ...tags: readonly CatalogCacheTag[]
): void => {
  const list = tags.length > 0 ? tags : [CACHE_TAG_CATALOG];
  for (const tag of list) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      // No incremental cache in this context (unit tests, CLI) — nothing to
      // invalidate.
    }
  }
};
