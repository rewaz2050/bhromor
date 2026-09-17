

import { vendorRoute } from "../_lib";

import { createProduct } from "@/lib/db/admin";

import { listVendorProducts } from "@/lib/db/vendor";

import { apiJson } from "@/lib/api-response";
import { revalidateCatalogCaches } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("products", async (ctx) => {
  const products = await listVendorProducts(ctx.db, ctx.shopId);
  return apiJson({ products });
});


export const POST = vendorRoute(
  "product-create",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    // Homepage curation is platform-owned: vendors cannot self-feature.
    if (body) {
      delete body.featured;
      delete body.isNew;
    }
    const product = await createProduct(ctx.db, body, ctx.shopId);
    revalidateCatalogCaches();
    return apiJson({ product }, 201);
  },
  { limit: 20 },
);
