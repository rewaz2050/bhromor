"use client";

/**
 * B2 (2026-09-28) — every review the customers can see, in one list.
 *
 * The dashboard shows the first few; a shop that wants to answer everything
 * comes here. Same card, no limit, so the rules (approved only, one reply,
 * the stamp moves with the wording) are identical in both places.
 */

import { useVendor } from "@/components/vendor/vendor-shell";
import { useVendorReviews } from "@/lib/use-vendor";
import { PageHeader, Skeleton } from "@/components/vendor/vendor-ui";
import VendorReviewsCard from "@/components/vendor/vendor-reviews-card";

export default function VendorReviewsPage() {
  const me = useVendor();
  const authed = me !== null;
  const reviews = useVendorReviews(authed);

  return (
    <div>
      <PageHeader
        title="Reviews"
        sub="What the people who bought from you wrote — and your public answer to it."
      />
      {!me ? (
        <Skeleton lines={3} />
      ) : (
        <VendorReviewsCard
          title="Every approved review"
          reviews={reviews.reviews}
          onReply={reviews.reply}
          loading={reviews.loading}
        />
      )}
    </div>
  );
}
