/**
 * GET /api/zones — active delivery zones for checkout.
 * Same honesty rule as /api/products: live rows, demo seeds, or an
 * explicit error — never silent substitution.
 */

import { DELIVERY_ZONES } from "@/lib/catalog";
import { getSupabaseServer } from "@/lib/supabase-server";
import { mapZone } from "@/lib/db/mappers";
import type { DbZone } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const demoZones = () =>
  DELIVERY_ZONES.map((z) => ({ ...z, active: z.active ?? true }));

export async function GET() {
  if (!isSupabaseConfigured()) {
    return apiJson({ source: "demo" as const, zones: demoZones() });
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
