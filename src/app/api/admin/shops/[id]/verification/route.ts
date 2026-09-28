/**
 * B5 (2026-09-28) — staff verify a shop (NID + trade licence).
 *
 * POST  { nid, tradeLicence, note? } — tick what was actually held and read.
 *       Writes the shop row AND one line of append-only history. Both documents
 *       in → the badge appears; either one lifted → the badge, the timestamp
 *       and the officer are cleared (the database does that, this route only
 *       asks).
 * GET   the staff-only trail: the note, who verified, and the last 20 events.
 *
 * Admin / super-admin only — the same gate as approving a shop.
 */

import { apiJson } from "@/lib/api-response";
import {
  setShopVerification,
  shopVerificationHistory,
} from "@/lib/db/shop-verification";
import { routeId, staffRoute } from "../../../_lib";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "super_admin"] as const;

export const POST = staffRoute(
  "shop-verification",
  async ({ db, user }, request, routeContext) => {
    const id = await routeId(routeContext);
    const body = await request.json().catch(() => null);
    const shop = await setShopVerification(db, id, body, {
      id: user.id,
      email: user.email,
    });
    return apiJson({ shop });
  },
  { limit: 30, roles: ROLES },
);

export const GET = staffRoute(
  "shop-verification-history",
  async ({ db }, _request, routeContext) => {
    const id = await routeId(routeContext);
    return apiJson(await shopVerificationHistory(db, id));
  },
  { limit: 60, roles: ROLES },
);
