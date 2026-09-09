

import { vendorRoute } from "../_lib";

import { listVendorEarnings } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("earnings", async (ctx) => {
  const earnings = await listVendorEarnings(ctx.db, ctx.shopId);
  return apiJson({ earnings });
});
