/**
 * GET /api/admin/threads — every conversation, for staff.
 *
 * A shop that stops answering is still the platform's customer standing there
 * with a question, so staff see all of it and can answer as "platform".
 * `?status=open&shopId=…` narrows it.
 */

import { staffRoute } from "../_lib";
import { listThreads, type ThreadStatus } from "@/lib/db/customer-threads";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = staffRoute("threads-list", async ({ db }, request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const shopId = url.searchParams.get("shopId") ?? undefined;
  const threads = await listThreads(db, {
    shopId,
    status: status === "open" || status === "closed" ? (status as ThreadStatus) : undefined,
  });
  return apiJson(threads);
});
