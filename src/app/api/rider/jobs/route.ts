import { apiJson } from "@/lib/api-response";
import { listRiderJobs } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/jobs — this rider's assignments with order details. */
export const GET = riderRoute("jobs", async (ctx) => {
  const jobs = await listRiderJobs(ctx.service, ctx.rider.id);
  return apiJson({ jobs });
});
