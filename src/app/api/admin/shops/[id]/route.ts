/**
 * C3 (2026-09-29) — GET one shop's whole file for the admin detail page.
 *
 * Read-only, and admin-only: the file includes the owner's login, the
 * shop's ledger and what PROSANTI owes it — numbers a manager's screen has
 * no business rendering. A shop that does not exist answers 404, never an
 * empty dossier that reads like a shop with no orders.
 */

import { apiError, apiJson } from "@/lib/api-response";
import { loadAdminShopDetail } from "@/lib/db/admin-shop";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "shop-detail",
  async ({ db }, _request, routeContext) => {
    const id = await routeId(routeContext);
    if (!id) return apiError("Which shop?", 400);
    const detail = await loadAdminShopDetail(db, id).catch(() => null);
    if (!detail) return apiError("That shop is not on PROSANTI.", 404);
    return apiJson({ shop: detail.shop, detail });
  },
  { limit: 120, roles: ["admin", "super_admin"] },
);
