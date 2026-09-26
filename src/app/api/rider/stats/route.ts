import { apiJson } from "@/lib/api-response";
import { getRiderStats } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/stats — the rider's own scoreboard: lifetime deliveries,
 * the last 7 days, and the customer delivery rating. Read-only, self-scoped.
 */
export const GET = riderRoute("stats", async (ctx) => {
  const stats = await getRiderStats(ctx.service, ctx.rider.id);
  return apiJson({ stats });
});
