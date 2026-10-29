import { revalidateCatalogCaches } from "@/lib/public-cache";
import { vendorCan } from "@/lib/vendor-permissions";
import { apiJson } from "@/lib/api-response";
import { AdminInputError } from "@/lib/db/admin";
import { routeId, vendorRoute } from "../../../_lib";
export const dynamic = "force-dynamic";
export const PATCH = vendorRoute("stock-adjust", async (ctx, request, context) => {
  if (!vendorCan(ctx,"inventory") && !vendorCan(ctx,"catalog")) throw new AdminInputError("Inventory delegation required.",403);
  const body = await request.json().catch(() => null) as { variantId?: unknown; available?: unknown } | null;
  if (typeof body?.variantId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.variantId) || !Number.isInteger(body.available) || Number(body.available)<0 || Number(body.available)>100000) {
    throw new AdminInputError("Send a variant id and available stock (0–100000).", 422);
  }
  const { data, error } = await ctx.db.rpc("ps_vendor_set_available_stock", {
    p_product_id: await routeId(context), p_variant_id: body.variantId, p_available: body.available,
  });
  if (error) {
    if (/forbidden/i.test(error.message)) throw new AdminInputError("Inventory permission required for this shop.", 403);
    if (/not found/i.test(error.message)) throw new AdminInputError("Active variant not found.", 404);
    throw new AdminInputError("Could not adjust stock. Check the inventory backend and try again.", 503);
  }
  const variant = Array.isArray(data) ? data[0] : data;
  if (!variant || typeof variant.id !== "string" || !Number.isInteger(variant.stock) || !Number.isInteger(variant.reserved) || !Number.isInteger(variant.available)) {
    throw new AdminInputError("Stock response was not confirmed. Refresh before retrying.", 503);
  }
  revalidateCatalogCaches();
  return apiJson({ variant });
}, { limit: 30 });

export const GET = vendorRoute("stock-read", async (ctx,_request,context) => {
  if (!vendorCan(ctx,"inventory") && !vendorCan(ctx,"catalog")) throw new AdminInputError("Inventory delegation required.",403);
  const id = await routeId(context);
  const { data: product, error: productError } = await ctx.db.from("products").select("id").eq("id",id).eq("shop_id",ctx.shopId).maybeSingle();
  if (productError || !product) throw new AdminInputError("Product not found.",404);
  const { data,error } = await ctx.db.from("product_variants").select("id,color,size,stock,reserved,available").eq("product_id",id).eq("active",true);
  if (error) throw new Error("variant inventory unavailable");
  return apiJson({ variants: data ?? [] });
});
