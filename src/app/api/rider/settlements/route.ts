import { apiJson } from "@/lib/api-response";
import {
  listRiderSettleClaim,
  listRiderSettlements,
  settleClaimsReady,
} from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/settlements — recent pay-ins plus any pending claim.
 *
 * `claimsReady:false` means the claim backend (202609250004) is not applied
 * to the database yet: the app hides the Settle button (the legacy function
 * would zero the COD balance without staff approval) and shows a short
 * notice instead of a dead control.
 */
export const GET = riderRoute("settlements", async (ctx) => {
  const [settlements, pendingClaim, claimsReady] = await Promise.all([
    listRiderSettlements(ctx.service, ctx.rider.id),
    listRiderSettleClaim(ctx.service, ctx.rider.id),
    settleClaimsReady(ctx.service),
  ]);
  return apiJson({ settlements, pendingClaim, claimsReady });
});
