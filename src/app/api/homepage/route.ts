/**
 * GET /api/homepage — public homepage CMS read.
 *
 * Serves the staff-published copy from site_settings['homepage'] through
 * the anon RLS policy; missing rows or a missing key fall back to the
 * shipped defaults.
 *
 * Perf (audit 2026-09-17 P1.1/P1.2): the row is identical for every visitor,
 * so it lives in the Next data cache (tag `homepage`, rebuilt by the admin
 * PATCH) and the 200 is CDN-cacheable for a minute.
 */

import { unstable_cache } from "next/cache";
import { readHomepageSetting } from "@/lib/db/engagement";
import { HOME_DEFAULTS, type HomeSettings } from "@/lib/home-cms";
import { getSupabaseAnon } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import {
  CACHE_TAG_HOMEPAGE,
  PUBLIC_CACHE_SECONDS,
  publicJson,
} from "@/lib/public-cache";

export const dynamic = "force-dynamic";

const readPublished = async (): Promise<HomeSettings | null> => {
  const db = getSupabaseAnon();
  if (!db) return null;
  return readHomepageSetting(db);
};

const cachedHomepage = unstable_cache(readPublished, ["homepage-v1"], {
  revalidate: PUBLIC_CACHE_SECONDS,
  tags: [CACHE_TAG_HOMEPAGE],
});

export async function GET() {
  try {
    let settings: HomeSettings | null;
    try {
      settings = await cachedHomepage();
    } catch {
      // No incremental cache in this context (tests, CLI) → read directly.
      settings = await readPublished();
    }
    if (!settings) return apiJson({ settings: HOME_DEFAULTS });
    return publicJson({ settings });
  } catch {
    // A bad minute at the database must never blank the homepage.
    return apiJson({ settings: HOME_DEFAULTS });
  }
}
