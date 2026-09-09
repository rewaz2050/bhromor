

import { routeId, vendorRoute } from "../../_lib";

import { getVendorOrderDetail } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute(
  "order-detail",
  async (ctx, _request, routeContext) => {
    const order = await getVendorOrderDetail(
      ctx.db,
      ctx.shopId,
      await routeId(routeContext),
    );
    return apiJson({ order });
  },
);
