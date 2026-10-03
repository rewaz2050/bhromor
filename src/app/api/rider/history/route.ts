/**
 * GET /api/rider/history?before=<iso> — the rider's finished trips (delivered
 * or finally failed), newest first, 30 per page. Self-scoped.
 */
import { apiJson } from "@/lib/api-response";
import { listRiderHistory } from "@/lib/db/rider-history";
import { parseHistoryCursor } from "@/lib/rider-history";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute("history", async (ctx, request) => {
  const before = parseHistoryCursor(new URL(request.url).searchParams.get("before"));
  const page = await listRiderHistory(ctx.service, ctx.rider.id, { before });
  return apiJson(page);
});
