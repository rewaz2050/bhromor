/**
 * GET /api/zones — active delivery zones for checkout.
 * Live rows or an explicit error — never silent substitution.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { mapZone } from "@/lib/db/mappers";
import type { DbZone } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return apiError(
      "Delivery zones are not configured yet — see docs/backend.md.",
      503,
      { code: "NOT_SEEDED" },
    );
  }
  try {
    const db = await getSupabaseServer();
    const { data, error } = db
      ? await db
          .from("delivery_zones")
          .select("*")
          .eq("active", true)
          .order("sort_order")
      : { data: null, error: new Error("unconfigured") };
    if (error || !data || data.length === 0) {
      return apiError(
        "Delivery zones are not configured yet — see docs/backend.md.",
        503,
        { code: "NOT_SEEDED" },
      );
    }
    return apiJson({
      source: "live" as const,
      zones: (data as DbZone[]).map(mapZone),
    });
  } catch {
    return apiError("Delivery zones are temporarily unavailable.", 503);
  }
}
