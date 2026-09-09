/**
 * PATCH /api/admin/reviews/[uuid] { status?, featured? } — moderate.
 * DELETE — remove permanently.
 */
import { deleteReviewRow, moderateReviewRow } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const PATCH = staffRoute(
  "reviews-moderate",
  async ({ db }, request, routeContext) => {
    const body: unknown = await request.json().catch(() => null);
    const review = await moderateReviewRow(db, await routeId(routeContext), body);
    return apiJson({ review });
  },
  { limit: 60 },
);

export const DELETE = staffRoute(
  "reviews-delete",
  async ({ db }, _request, routeContext) => {
    await deleteReviewRow(db, await routeId(routeContext));
    return apiJson({ ok: true as const });
  },
  { limit: 20 },
);
