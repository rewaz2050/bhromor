
import { vendorRoute } from "../_lib";

import { listShopFollows } from "@/lib/db/growth";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * B1 (2026-09-28) — the shop's own followers, for the dashboard card.
 *
 * Read through the vendor's RLS client: the `shop follows vendor read`
 * policy in 202609280001_shop_follows.sql limits it to `ps_vendor_shop()`,
 * so a shop can only ever see its own list. `neverReached` is the honest
 * half — numbers the push pipeline could not deliver to, which the shop is
 * expected to call.
 */
export const GET = vendorRoute("followers", async (ctx) => {
  const followers = await listShopFollows(ctx.db, ctx.shopId);
  return apiJson({
    followers: followers.length,
    /** Phones no message has gone to yet — the shop's call list. */
    neverReached: followers.filter((f) => !f.lastNotifiedAt).map((f) => f.phone),
    rows: followers.map((f) => ({
      phone: f.phone,
      marketingOk: f.marketingOk,
      lastNotifiedAt: f.lastNotifiedAt,
      createdAt: f.createdAt,
    })),
  });
});
