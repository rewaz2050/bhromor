/** PATCH /api/admin/products/[uuid] — partial product update. */
import { updateProduct } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const PATCH = staffRoute(
  "products-update",
  async ({ db }, request, routeContext) => {
    const body: unknown = await request.json().catch(() => null);
    const product = await updateProduct(db, await routeId(routeContext), body);
    return apiJson({ product });
  },
  { limit: 30 },
);
