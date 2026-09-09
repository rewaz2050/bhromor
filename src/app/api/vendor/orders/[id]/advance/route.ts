

import { routeId, vendorRoute } from "../../../_lib";

import { advanceVendorOrder } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const POST = vendorRoute(
  "order-advance",
  async (ctx, request, routeContext) => {
    const body = (await request.json().catch(() => null)) as {
      to?: string;
    } | null;
    const order = await advanceVendorOrder(
      ctx.db,
      ctx.shopId,
      await routeId(routeContext),
      (body?.to ?? "").trim().slice(0, 32),
    );
    return apiJson({ order });
  },
  { limit: 30 },
);
