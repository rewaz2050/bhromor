/** GET /api/admin/deliveries — staff dispatch board (assignments + orders). */
import {
  expireStaleAssignments,
  listAwaitingDispatchOrders,
  listDispatchJobs,
} from "@/lib/db/riders";
import { apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("deliveries-list", async ({ db }) => {
  // Housekeeping before the read: expire timed-out offers and re-offer.
  // ps_expire_stale_offers is service-only since 202609160004, so it runs on
  // the service client (staffRoute already verified the session). It is
  // best-effort here — the rider job feed runs the same sweep — so a
  // missing service key degrades to "offers expire on the next rider poll"
  // rather than an empty dispatch board.
  const service = getSupabaseService();
  if (service) {
    await expireStaleAssignments(service).catch((err: unknown) => {
      console.error(
        "[admin/deliveries] ps_expire_stale_offers failed:",
        err instanceof Error ? err.message : err,
      );
    });
  }
  const [deliveries, awaitingOrders] = await Promise.all([
    listDispatchJobs(db),
    listAwaitingDispatchOrders(db),
  ]);
  return apiJson({ deliveries, awaitingOrders });
});
