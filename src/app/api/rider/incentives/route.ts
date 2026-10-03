/**
 * GET /api/rider/incentives — the rider's own bonus picture (item V): today's
 * progress toward the daily target, their referral code and how the riders
 * they referred are doing. Self-scoped; `ready:false` until 202610020010 runs.
 */
import { apiJson } from "@/lib/api-response";
import { getRiderIncentives } from "@/lib/db/rider-incentives";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute("incentives", async (ctx) => {
  const view = await getRiderIncentives(ctx.service, ctx.rider.id);
  return apiJson({ ready: view !== null, view });
});
