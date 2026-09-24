/**
 * GET /api/admin/deliveries/stranded — the orders that are ready for a rider
 * but have NO live offer, each with the reason dispatch found nobody.
 *
 * This is the answer to "rider offer paochhe na, kuno mill nai" (2026-09-25).
 * Before this the board simply listed the order as awaiting and every cause
 * looked identical: nobody online, wrong zone, off-shift, cash cap, all busy,
 * or every rider in the zone already saw it. `ps_dispatch_diagnosis` counts
 * the riders in each bucket so the panel prints the actual blocker.
 */
import { listStrandedOrders } from "@/lib/db/riders";
import { apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("deliveries-stranded", async () => {
  const service = getSupabaseService();
  if (!service) return apiJson({ stranded: [], available: false });
  try {
    const stranded = await listStrandedOrders(service, 20);
    return apiJson({ stranded, available: true });
  } catch (err) {
    // A database that predates 202609250001 has no such function — say so
    // instead of failing the whole dispatch board.
    const message = err instanceof Error ? err.message : "";
    if (/does not exist|PGRST202|42883/i.test(message)) {
      return apiJson({
        stranded: [],
        available: false,
        migration: "supabase/migrations/202609250001_rider_dispatch_fix.sql",
      });
    }
    throw err;
  }
});
