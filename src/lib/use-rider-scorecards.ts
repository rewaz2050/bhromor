"use client";

/** Admin → Riders → Scorecards (item M, 202610020006). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { RankedCard } from "./rider-quality";

export const useRiderScorecards = () => {
  const { live, checked } = useStaffLive();
  const [riders, setRiders] = useState<RankedCard[]>([]);
  const [ready, setReady] = useState(true);
  const [autoSuspend, setAutoSuspend] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ ready: boolean; riders: RankedCard[]; autoSuspend: boolean }>("/api/admin/riders/scorecards");
      setRiders(Array.isArray(data.riders) ? data.riders : []);
      setReady(data.ready !== false);
      setAutoSuspend(data.autoSuspend === true);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void refresh();
  }, [live, refresh]);

  const setPolicy = useCallback(async (enabled: boolean): Promise<boolean> => {
    try {
      const data = await apiSend<{ autoSuspend: boolean }>("/api/admin/riders/scorecards", "PATCH", { autoSuspend: enabled });
      setAutoSuspend(data.autoSuspend === true);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  return { live, checked, riders, ready, autoSuspend, loaded, error, refresh, setPolicy };
};
