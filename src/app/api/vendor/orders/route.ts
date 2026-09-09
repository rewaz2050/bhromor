

import { vendorRoute } from "../_lib";

import { listVendorOrders } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("orders", async (ctx, request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const orders = await listVendorOrders(ctx.db, ctx.shopId, status);
  return apiJson({ orders });
});
