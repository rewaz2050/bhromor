/**
 * GET /api/admin/orders?status=&q=&shop=&limit=&cursor= — staff order queue,
 * one keyset page (newest first). `shop` narrows the queue to one marketplace
 * shop (Admin → Shops deep link, 2026-09-27). The response carries
 * `nextCursor`; pass it back as `cursor` for the next (older) page, null when
 * exhausted.
 */
import { listOrders } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("orders-list", async ({ db }, request) => {
  const url = new URL(request.url);
  const { orders, nextCursor } = await listOrders(db, {
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    shop: url.searchParams.get("shop") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  return apiJson({ orders, nextCursor });
});
