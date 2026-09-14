/**
 * GET /api/admin/reports/best-sellers — P2 #4.
 *
 * The all-time best-seller list the Reports page shows: units straight from
 * v_product_sales (the same view the storefront's "N sold" badge and
 * "Best sellers" sort read) plus the revenue those units made. Server-side
 * on purpose — the client-side "Top products" table works from the 100-row
 * order queue and cannot see the refunded-return correction.
 */

import { staffRoute } from "../../_lib";
import { bestSellers } from "@/lib/db/reports";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = staffRoute("reports-best-sellers", async ({ db }) => {
  const bestSellersRows = await bestSellers(db, { limit: 10 });
  return apiJson({ bestSellers: bestSellersRows });
});
