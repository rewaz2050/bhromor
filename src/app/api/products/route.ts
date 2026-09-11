/**
 * GET /api/products — published storefront catalog.
 * Live rows when Supabase is configured AND seeded; otherwise an honest
 * 503 NOT_SEEDED — never silent substitution.
 */

import { fetchLiveCatalog } from "@/lib/db/catalog";
import { isSupabaseConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";

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
    return apiJson({ source: "live" as const, ...live });
  } catch {
    return apiError("Catalog is temporarily unavailable.", 503);
  }
}
