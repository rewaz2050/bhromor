"use client";

import { useSyncExternalStore } from "react";
import {
  deleteReview,
  featureReview,
  getReviews,
  getReviewsServer,
  moderateReview,
  resetReviews,
  submitReview,
  subscribeReviews,
} from "./reviews-store";
import type { Review, ReviewStatus } from "./review-store";

export function useReviews() {
  const reviews = useSyncExternalStore(
    subscribeReviews,
    getReviews,
    getReviewsServer,
  );

  return {
    reviews,
    submit: (r: Review) => submitReview(r),
    moderate: (id: string, status: ReviewStatus) =>
      moderateReview(id, status as "approved" | "hidden" | "flagged"),
    feature: (id: string) => featureReview(id),
    remove: (id: string) => deleteReview(id),
    reset: resetReviews,
  };
}
