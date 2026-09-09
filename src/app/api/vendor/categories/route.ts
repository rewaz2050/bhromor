

import { vendorRoute } from "../_lib";

import { listVendorCategories } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("categories", async (ctx) => {
  const categories = await listVendorCategories(ctx.db);
  return apiJson({ categories });
});
