/** GET /api/admin/orders?status=&q=&limit= — staff order queue. */
import { listOrders } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("orders-list", async ({ db }, request) => {
  const url = new URL(request.url);
  const orders = await listOrders(db, {
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
  });
  return apiJson({ orders });
});
