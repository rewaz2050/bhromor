"use client";

/**
 * Admin review data with live cutover (see use-orders.ts).
 * Public reads/writes go through usePublicReviews() instead — staff
 * endpoints must never serve the storefront.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useReviews() {
  const demoReviews = useSyncExternalStore(
    subscribeReviews,
    getReviews,
    getReviewsServer,
  );
  const { live, checked } = useStaffLive();
  const [liveReviews, setLiveReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ reviews: Review[] }>("/api/admin/reviews");
      setLiveReviews(data.reviews);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveReviews(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  /** Demo-only: public submissions use usePublicReviews(). */
  const submit = useCallback(
    (r: Review) => {
      if (!live) submitReview(r);
    },
    [live],
  );

  const moderate = useCallback(
    async (id: string, status: ReviewStatus): Promise<void> => {
      if (!live) {
        moderateReview(id, status as "approved" | "hidden" | "flagged");
        return;
      }
      try {
        await apiSend(
          `/api/admin/reviews/${encodeURIComponent(id)}`,
          "PATCH",
          { status },
        );
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, refresh],
  );

  const feature = useCallback(
    async (id: string): Promise<void> => {
      if (!live) {
        featureReview(id);
        return;
      }
      const current = liveReviews?.find((r) => r.id === id);
      try {
        await apiSend(
          `/api/admin/reviews/${encodeURIComponent(id)}`,
          "PATCH",
          { featured: !(current?.featured ?? false) },
        );
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, liveReviews, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!live) {
        deleteReview(id);
        return;
      }
      try {
        await apiSend(
          `/api/admin/reviews/${encodeURIComponent(id)}`,
          "DELETE",
        );
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, refresh],
  );

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetReviews();
  }, [live, refresh]);

  return {
    reviews: live ? (liveReviews ?? []) : demoReviews,
    submit,
    moderate,
    feature,
    remove,
    reset,
    live,
    loading: live && (!checked || liveReviews === null),
    error,
    clearError: () => setError(null),
  };
}
