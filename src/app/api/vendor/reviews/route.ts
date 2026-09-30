
import { vendorRoute } from "../_lib";

import { listVendorReviews, saveVendorReply } from "@/lib/db/vendor-reviews";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * B2 (2026-09-28) — the shop's reviews, and its reply.
 *
 * GET  → approved reviews of this shop's products (with photos).
 * PATCH { id, reply } → write/reword the public answer.
 *
 * Both run on the vendor's RLS client, so the policies in
 * 202609280002_review_replies.sql are the authority — not this route.
 */
export const GET = vendorRoute("reviews", async (ctx) => {
  const reviews = await listVendorReviews(ctx.db, ctx.shopId);
  return apiJson({ reviews });
});

export const PATCH = vendorRoute(
  "review-reply",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const b = body ?? {};
    const id = typeof b.id === "string" ? b.id.trim().slice(0, 64) : "";
    const review = await saveVendorReply(ctx.db, {
      id,
      shopId: ctx.shopId,
      reply: b.reply,
      by: ctx.user.email ?? null,
    });
    return apiJson({ review });
  },
  { limit: 30 },
);
