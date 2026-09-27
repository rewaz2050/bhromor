/**
 * GET /api/live — what's on air, what's next, and what was on last (P1 #9).
 *
 * The storefront's single read: the LIVE session (if the shop has tapped
 * Start), the nearest scheduled one, and `last` — the most recent ended
 * session (≤ 60 days) whose pieces are still published (UX plan §10, R10:
 * "what we showed on the last live" rail). 503 when the backend is
 * unconfigured — the storefront then shows no live UI at all, never a fake
 * "LIVE".
 */
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { getPublicLive } from "@/lib/db/live";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseService();
  if (!db) return apiError("Live shopping is temporarily unavailable.", 503);
  try {
    const { live, upcoming, last } = await getPublicLive(db);
    return apiJson({ live, upcoming, last });
  } catch {
    return apiError("Live shopping is temporarily unavailable.", 503);
  }
}
