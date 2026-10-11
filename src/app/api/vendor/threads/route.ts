/**
 * GET /api/vendor/threads — the shop's inbox.
 *
 * Scoped to the shop on the vendor token, so a shop can only ever see
 * conversations about its own orders. Newest activity first; `?status=open`
 * is what the "needs an answer" view asks for.
 */

import { vendorRoute } from "../_lib";
import { listThreads, type ThreadStatus } from "@/lib/db/customer-threads";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("threads-list", async (ctx, request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const threads = await listThreads(ctx.db, {
    shopId: ctx.shopId,
    status: status === "open" || status === "closed" ? (status as ThreadStatus) : undefined,
  });
  return apiJson(threads);
});
