"use client";

/** Admin → Riders → one rider (202610020002). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet } from "./admin-api";
import type { RiderOverview, RiskAssessment } from "./rider-risk";

export const useRiderOverview = (riderId: string) => {
  const { live, checked } = useStaffLive();
  const [overview, setOverview] = useState<RiderOverview | null>(null);
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await apiGet<{ ready: boolean; overview: RiderOverview | null; assessment: RiskAssessment | null }>(
        `/api/admin/riders/${encodeURIComponent(riderId)}/overview`,
      );
      setOverview(data.overview);
      setAssessment(data.assessment);
      setReady(data.ready);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void refresh();
  }, [live, refresh]);

  return { live, checked, overview, assessment, ready, loading, error, refresh };
};
