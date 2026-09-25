import { apiJson } from "@/lib/api-response";
import { listRiderSettleClaim, listRiderSettlements } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/settlements — recent pay-ins plus any pending claim. */
export const GET = riderRoute("settlements", async (ctx) => {
  const [settlements, pendingClaim] = await Promise.all([
    listRiderSettlements(ctx.service, ctx.rider.id),
    listRiderSettleClaim(ctx.service, ctx.rider.id),
  ]);
  return apiJson({ settlements, pendingClaim });
});
