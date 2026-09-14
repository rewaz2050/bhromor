/**
 * GET /api/live — what's on air and what's next (P1 #9).
 *
 * The storefront's single read: the LIVE session (if the shop has tapped
 * Start) and the nearest scheduled one. 503 when the backend is
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
    const { live, upcoming } = await getPublicLive(db);
    return apiJson({ live, upcoming });
  } catch {
    return apiError("Live shopping is temporarily unavailable.", 503);
  }
}
