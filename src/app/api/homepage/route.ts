/**
 * GET /api/homepage — public homepage CMS read.
 *
 * Serves the staff-published copy from site_settings['homepage'] through
 * the anon RLS policy; missing rows or a missing key fall back to the
 * shipped defaults (same merge the demo store uses). Demo mode answers
 * { demoMode: true } and the client keeps its browser-local settings.
 */

import { readHomepageSetting } from "@/lib/db/engagement";
import { HOME_DEFAULTS } from "@/lib/home-cms";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return apiJson({ demoMode: true as const });
  }
  try {
    const db = await getSupabaseServer();
    if (!db) return apiJson({ demoMode: true as const });
    const settings = await readHomepageSetting(db);
    return apiJson({ settings });
  } catch {
    // A bad minute at the database must never blank the homepage.
    return apiJson({ settings: HOME_DEFAULTS });
  }
}
