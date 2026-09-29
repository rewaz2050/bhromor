

import { vendorRoute } from "../_lib";

import {
  createVendorProductCategory,
  listVendorCategoryData,
} from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("categories", async (ctx) => {
  const result = await listVendorCategoryData(ctx.db, ctx.shopId);
  return apiJson(result);
});

export const POST = vendorRoute(
  "category-create",
  async (ctx, request) => {
    const body: unknown = await request.json().catch(() => null);
    const category = await createVendorProductCategory(ctx.db, ctx.shopId, body);
    return apiJson({ category }, 201);
  },
  { limit: 20 },
);
