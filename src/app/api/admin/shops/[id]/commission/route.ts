/**
 * C4 (2026-09-29) — GET one shop's commission trail.
 *
 * Read-only, admin-only, and it adds no new writer: the trail is written by
 * the database alone (trigger in 202609290001), so the only way a line ends up
 * here is to have actually moved the rate.
 *
 * A database that has not run the migration answers 503 with the migration's
 * name rather than an empty list — "nothing has ever changed" and "history is
 * switched off" must never look the same on a page about money.
 */

import { AdminInputError } from "@/lib/db/admin";
import { apiError, apiJson } from "@/lib/api-response";
import { listCommissionHistory } from "@/lib/db/commission-audit";
import { routeId, staffRoute } from "../../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "shop-commission-history",
  async ({ db }, _request, routeContext) => {
    const id = await routeId(routeContext);
    if (!id) return apiError("Which shop?", 400);
    try {
      const changes = await listCommissionHistory(db, id);
      return apiJson({ changes });
    } catch (err) {
      if (err instanceof AdminInputError) return apiError(err.message, err.status);
      throw err;
    }
  },
  { limit: 120, roles: ["admin", "super_admin"] },
);
