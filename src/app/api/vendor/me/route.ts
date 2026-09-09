

import { vendorRoute } from "../_lib";

import { getVendorShop } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("me", async (ctx) => {
  const shop = await getVendorShop(ctx.db, ctx.shopId);
  return apiJson(
    { email: ctx.user.email ?? "", role: ctx.role, shop },
  );
});
