"use client";

/**
 * Admin rider data with live cutover (see use-shops.ts).
 * Staff queue reads/writes through /api/admin/riders when live, else the
 * browser-local demo store. Riders never appear on the storefront.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getRiders,
  getRidersServer,
  resetRiderStore,
  saveRiderInStore,
  subscribeRiders,
} from "./riders-store";
import type { Rider } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useRiders() {
  const demoRiders = useSyncExternalStore(
    subscribeRiders,
    getRiders,
    getRidersServer,
  );
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveRiders(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveRider = useCallback(
    async (r: Rider): Promise<boolean> => {
      if (!live) {
        saveRiderInStore(r);
        return true;
      }
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
      const current = (live ? liveRiders : demoRiders)?.find(
        (r) => r.id === id,
      );
      if (!current) return false;
      return saveRider({ ...current, status });
    },
    [live, liveRiders, demoRiders, saveRider],
  );

  /** Staff records a rider cash pay-in and zeroes the balance (live only). */
  const settleCash = useCallback(
    async (
      id: string,
      method: string,
      reference: string,
    ): Promise<boolean> => {
      if (!live) {
        const current = demoRiders.find((r) => r.id === id);
        if (!current) return false;
        saveRiderInStore({ ...current, cashInHand: 0 });
        setError(null);
        return true;
      }
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
    [live, demoRiders, refresh],
  );

  /** Link an Auth account as this rider's login (live only). */
  const linkRider = useCallback(
    async (id: string, email: string): Promise<boolean> => {
      if (!live) {
        setError("Rider linking needs live mode — demo riders have no accounts.");
        return false;
      }
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

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetRiderStore();
  }, [live, refresh]);

  const riders: Rider[] = live ? (liveRiders ?? []) : demoRiders;
  return {
    riders,
    pending: riders.filter((r) => r.status === "pending"),
    saveRider,
    setStatus,
    settleCash,
    linkRider,
    reset,
    live,
    loading: live && (!checked || liveRiders === null),
    error,
    clearError: () => setError(null),
  };
}
