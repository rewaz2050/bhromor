/** GET /api/rider/ratings — the rider's own rating breakdown (self-scoped, read-only). */
import { apiJson } from "@/lib/api-response";
import { getRiderRatingSummary } from "@/lib/db/rider-rating";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute("ratings", async (ctx) => {
  const summary = await getRiderRatingSummary(ctx.service, ctx.rider.id);
  return apiJson({ ready: summary !== null, summary });
});
