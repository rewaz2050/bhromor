

import { vendorRoute } from "../_lib";

import { getVendorShop, patchVendorShop } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("shop", async (ctx) => {
  const shop = await getVendorShop(ctx.db, ctx.shopId);
  return apiJson({ shop });
});


export const PATCH = vendorRoute(
  "shop-update",
  async (ctx, request) => {
    const body = await request.json().catch(() => null);
    const shop = await patchVendorShop(ctx.db, ctx.shopId, ctx.role, body);
    return apiJson({ shop });
  },
  { limit: 20 },
);
