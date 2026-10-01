import { apiJson } from "@/lib/api-response";
import { listRiderHistory } from "@/lib/db/riders";
import { riderRoute } from "../_lib";
export const dynamic = "force-dynamic";
export const GET = riderRoute("history", async ({ service, rider }, request) => {
  const url = new URL(request.url);
  const jobs = await listRiderHistory(service, rider.id, {
    search: url.searchParams.get("search") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return apiJson({ jobs });
});
