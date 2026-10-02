import { apiJson } from "@/lib/api-response";
import { getRiderStats } from "@/lib/db/riders";
import { getRiderToday } from "@/lib/db/rider-history";
import { readDispatchSettings } from "@/lib/db/dispatch-settings";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/stats — the rider's own scoreboard: lifetime deliveries,
 * the last 7 days, today's deliveries + earnings, and the customer delivery
 * rating, and the cash cap. Read-only, self-scoped. Today's figures are best-effort.
 */
export const GET = riderRoute("stats", async (ctx) => {
  const [stats, today, dispatch] = await Promise.all([
    getRiderStats(ctx.service, ctx.rider.id),
    getRiderToday(ctx.service, ctx.rider.id).catch(() => ({})),
    // J: the cash cap the rider's meter fills toward (admin-editable).
    readDispatchSettings(ctx.service),
  ]);
  return apiJson({ stats: { ...stats, ...today, cashLimit: dispatch.cashCap } });
});
