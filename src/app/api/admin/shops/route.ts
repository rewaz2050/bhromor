/**
 * Staff shops queue (marketplace phase 2, slice 2).
 * GET → all shops + product counts. POST → staff upsert (manual create,
 * approve/suspend/commission edits). Contact emails stay staff-only.
 */
import { listShopsFull, upsertShop } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("shops-list", async ({ db }) => {
  const shops = await listShopsFull(db);
  return apiJson({ shops });
});

export const POST = staffRoute(
  "shops-write",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const shop = await upsertShop(db, body);
    return apiJson({ shop });
  },
  { limit: 30 },
);
