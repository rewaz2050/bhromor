/**
 * GET /api/vendor/funnel?days=7|28 — the shop's OWN funnel (B4, 2026-09-28).
 *
 * Sessions that reached this shop's storefront → opened a product → added to
 * bag → started checkout → ordered, plus its own top products by views, adds
 * and real orders.
 *
 * The shop id comes from the verified vendor session (ctx.shopId) — never from
 * the query string — and the report runs on the service client, because
 * storefront_events is deliberately unreadable from the browser.
 *
 * `missing: true` (503) when migration 202609280004 has not been applied: the
 * card asks for the migration rather than showing zeros as if the shop were
 * empty.
 */

import { apiJson } from "@/lib/api-response";
import { shopFunnelFor } from "@/lib/db/vendor-funnel";
import { vendorRoute } from "../_lib";

export const dynamic = "force-dynamic";

const parseDays = (raw: string | null): 7 | 28 => (raw === "28" ? 28 : 7);

export const GET = vendorRoute("funnel", async (ctx, request) => {
  const days = parseDays(new URL(request.url).searchParams.get("days"));
  const { report, missing } = await shopFunnelFor(ctx.shopId, days);
  if (missing || !report) {
    return apiJson({ error: "The funnel report is not installed yet.", missing: true }, 503);
  }
  return apiJson(report);
});
