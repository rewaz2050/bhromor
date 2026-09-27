/**
 * POST /api/admin/shops/[id]/review — staff decision on a shop application
 * (round 4, 2026-09-26): `{ status: "active" | "rejected" | "suspended" |
 * "pending", note? }`.
 *
 * Unlike the generic upsert this stamps the audit columns (reviewed_by /
 * reviewed_by_email / reviewed_at) and stores the reason the applicant
 * reads on /vendor/login when rejected. Admin/super-admin only.
 */
import { staffRoute, routeId } from "../../../_lib";
import { reviewApplication } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "shop-review",
  async ({ db, user }, request, routeContext) => {
    const id = await routeId(routeContext);
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      status?: unknown;
      note?: unknown;
    };
    const shop = await reviewApplication(db, "shop", id, body, {
      id: user.id,
      email: user.email,
    });
    return apiJson({ shop });
  },
  { limit: 30, roles: ["admin", "super_admin"] },
);
