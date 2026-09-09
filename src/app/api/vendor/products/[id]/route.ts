

import { routeId, vendorRoute } from "../../_lib";

import { updateProduct } from "@/lib/db/admin";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const PATCH = vendorRoute(
  "product-update",
  async (ctx, request, routeContext) => {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    // Homepage curation is platform-owned: vendors cannot self-feature.
    if (body) {
      delete body.featured;
      delete body.isNew;
    }
    // updateProduct reads through the vendor RLS client: other shops'
    // products are invisible, so a wrong id 404s instead of leaking.
    const product = await updateProduct(
      ctx.db,
      await routeId(routeContext),
      body,
    );
    return apiJson({ product });
  },
  { limit: 30 },
);
