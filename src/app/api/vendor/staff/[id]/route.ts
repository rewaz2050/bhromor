/**
 * C1 (2026-09-28) — DELETE /api/vendor/staff/[id]: revoke a staff login.
 *
 * The row goes, the person's account stays. That distinction is the whole
 * safety argument: the same login may be a customer's or a rider's, and
 * deleting it would take their parcels and history with it. Revoking only
 * closes the door to THIS shop.
 */
import { vendorRoute, routeId } from "../../_lib";
import { revokeVendorStaff } from "@/lib/db/vendor-staff";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const DELETE = vendorRoute(
  "staff-revoke",
  async (ctx, _request, routeContext) => {
    const id = await routeId(routeContext);
    if (id === "") {
      return apiJson({ error: "Missing login id." }, 400);
    }
    const { revoked } = await revokeVendorStaff(ctx.db, ctx.shopId, ctx.role, id);
    return apiJson({ revoked });
  },
  { limit: 10 },
);
