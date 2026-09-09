/** GET /api/admin/deliveries — staff dispatch board (assignments + orders). */
import { listAwaitingDispatchOrders, listDispatchJobs } from "@/lib/db/riders";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("deliveries-list", async ({ db }) => {
  const [deliveries, awaitingOrders] = await Promise.all([
    listDispatchJobs(db),
    listAwaitingDispatchOrders(db),
  ]);
  return apiJson({ deliveries, awaitingOrders });
});
