

import { vendorRoute } from "../_lib";

import { getVendorShop, patchVendorShop } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";
import { CACHE_TAG_SHOPS, revalidateCatalogCaches } from "@/lib/public-cache";
import { withoutReview } from "@/lib/shop-utils";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("shop", async (ctx) => {
  const shop = await getVendorShop(ctx.db, ctx.shopId);
  return apiJson({ shop: withoutReview(shop) });
});


export const PATCH = vendorRoute(
  "shop-update",
  async (ctx, request) => {
    const body = await request.json().catch(() => null);
    const shop = await patchVendorShop(ctx.db, ctx.shopId, ctx.role, body);
    revalidateCatalogCaches(CACHE_TAG_SHOPS);
    return apiJson({ shop: withoutReview(shop) });
  },
  { limit: 20 },
);
