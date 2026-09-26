/**
 * POST /api/admin/riders/[id]/review — staff decision on a rider
 * application (round 4, 2026-09-26): `{ status: "active" | "rejected" |
 * "suspended" | "pending", note? }`.
 *
 * Stamps reviewed_by / reviewed_by_email / reviewed_at and stores the
 * reason a rejected rider reads on /rider/login. Admin/super-admin only.
 */
import { staffRoute, routeId } from "../../../_lib";
import { reviewApplication } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "rider-review",
  async ({ db, user }, request, routeContext) => {
    const id = await routeId(routeContext);
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      status?: unknown;
      note?: unknown;
    };
    const rider = await reviewApplication(db, "rider", id, body, {
      id: user.id,
      email: user.email,
    });
    return apiJson({ rider });
  },
  { limit: 30, roles: ["admin", "super_admin"] },
);
