"use client";

/**
 * Admin review data — live only. Reads/writes go through /api/admin/reviews.
 * Public reads/writes use usePublicReviews() instead — staff endpoints must
 * never serve the storefront.
 */

import { useCallback, useEffect, useState } from "react";
import type { Review, ReviewStatus } from "./review-store";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useReviews() {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setLiveReviews(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const submit = useCallback((_r: Review) => {
    // Public submissions go through usePublicReviews() — no-op here.
  }, []);

  const moderate = useCallback(
    async (id: string, status: ReviewStatus): Promise<void> => {
      if (!live) return;
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
      if (!live) return;
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
      if (!live) return;
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

  return {
    reviews: liveReviews ?? [],
    submit,
    moderate,
    feature,
    remove,
    reset: refresh,
    live,
    loading: live && (!checked || liveReviews === null),
    error,
    clearError: () => setError(null),
  };
}
