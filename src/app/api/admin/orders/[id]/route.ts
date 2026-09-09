/** GET /api/admin/orders/[orderNo] — staff order detail. */
import { getOrderDetail } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "orders-detail",
  async ({ db }, _request, routeContext) => {
    const order = await getOrderDetail(db, await routeId(routeContext));
    return apiJson({ order });
  },
);
