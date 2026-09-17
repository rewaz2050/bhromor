/**
 * GET /api/products — published storefront catalog.
 * Live rows when Supabase is configured AND seeded; otherwise an honest
 * 503 NOT_SEEDED — never silent substitution.
 */

import { fetchLiveCatalog } from "@/lib/db/catalog";
import { isSupabaseConfigured } from "@/lib/env";
import { apiError } from "@/lib/api-response";
import { publicJson } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return apiError(
      "Catalog is not seeded yet — see docs/backend.md.",
      503,
      { code: "NOT_SEEDED" },
    );
  }
  try {
    const live = await fetchLiveCatalog();
    if (!live) {
      // Configured but empty/unseeded — say so instead of silently
      // serving rows that could carry different prices.
      return apiError(
        "Catalog is not seeded yet — see docs/backend.md.",
        503,
        { code: "NOT_SEEDED" },
      );
    }
    // Same rows for every visitor → the CDN may hold this for a minute
    // (admin catalog edits invalidate the data cache behind it).
    return publicJson({ source: "live" as const, ...live });
  } catch {
    return apiError("Catalog is temporarily unavailable.", 503);
  }
}
