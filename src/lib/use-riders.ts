"use client";

/**
 * Admin rider data — live only. Reads/writes go through /api/admin/riders.
 * Riders never appear on the storefront.
 */

import { useCallback, useEffect, useState } from "react";
import type { Rider } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useRiders() {
  const { live, checked } = useStaffLive();
  const [liveRiders, setLiveRiders] = useState<Rider[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ riders: Rider[] }>("/api/admin/riders");
      setLiveRiders(data.riders);
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
      setLiveRiders(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveRider = useCallback(
    async (r: Rider): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend("/api/admin/riders", "POST", r);
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const setStatus = useCallback(
    async (id: string, status: Rider["status"]): Promise<boolean> => {
      const current = liveRiders?.find((r) => r.id === id);
      if (!current) return false;
      return saveRider({ ...current, status });
    },
    [liveRiders, saveRider],
  );

  /** Staff records a rider cash pay-in and zeroes the balance. */
  const settleCash = useCallback(
    async (
      id: string,
      method: string,
      reference: string,
    ): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/riders/${encodeURIComponent(id)}/settle`,
          "POST",
          { method, reference },
        );
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  /** Link an Auth account as this rider's login. */
  const linkRider = useCallback(
    async (id: string, email: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/riders/${encodeURIComponent(id)}/link-rider`,
          "POST",
          { email },
        );
        setError(null);
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live],
  );

  const riders: Rider[] = liveRiders ?? [];
  return {
    riders,
    pending: riders.filter((r) => r.status === "pending"),
    saveRider,
    setStatus,
    settleCash,
    linkRider,
    reset: refresh,
    live,
    loading: live && (!checked || liveRiders === null),
    error,
    clearError: () => setError(null),
  };
}
