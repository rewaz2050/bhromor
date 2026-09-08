/**
 * GET /api/products — published storefront catalog.
 * Live rows when Supabase is configured AND seeded; the typed demo seeds
 * otherwise. The `source` field always says which one served the request —
 * callers must never guess.
 */

import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { fetchLiveCatalog } from "@/lib/db/catalog";
import { isSupabaseConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return apiJson({
      source: "demo" as const,
      products: PRODUCTS,
      categories: CATEGORIES,
      zones: DELIVERY_ZONES.map((z) => ({ ...z, active: z.active ?? true })),
    });
  }
  try {
    const live = await fetchLiveCatalog();
    if (!live) {
      // Configured but empty/unseeded — say so instead of silently
      // serving demo rows that could carry different prices.
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
