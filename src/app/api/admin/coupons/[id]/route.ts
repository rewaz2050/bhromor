/** DELETE /api/admin/coupons/[uuid] — blocked when past orders reference it. */
import { deleteCoupon } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const DELETE = staffRoute(
  "coupons-delete",
  async ({ db }, _request, routeContext) => {
    await deleteCoupon(db, await routeId(routeContext));
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
