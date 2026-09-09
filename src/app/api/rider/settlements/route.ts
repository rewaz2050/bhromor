import { apiJson } from "@/lib/api-response";
import { listRiderSettlements } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/settlements — this rider's recent cash pay-ins. */
export const GET = riderRoute("settlements", async (ctx) => {
  const settlements = await listRiderSettlements(ctx.service, ctx.rider.id);
  return apiJson({ settlements });
});
