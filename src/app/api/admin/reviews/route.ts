/** GET /api/admin/reviews?status= — moderation queue with product names. */
import { listReviewsFull } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("reviews-list", async ({ db }, request) => {
  const url = new URL(request.url);
  const reviews = await listReviewsFull(
    db,
    url.searchParams.get("status") ?? undefined,
  );
  return apiJson({ reviews });
});
