"use client";

/**
 * Admin rider data — live only. Reads/writes go through /api/admin/riders.
 * Riders never appear on the storefront.
 */

import { useCallback, useEffect, useState } from "react";
import type { Rider } from "./catalog";
import type { SettleClaim } from "./db/riders";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { usePoll } from "./use-poll";

/**
 * Rider roster refresh while a staff page that shows online/load state is
 * open (dispatch board, riders page). 0 = load once (default).
 */
export const RIDERS_POLL_MS = 30_000;

export function useRiders(pollMs = 0) {
  const { live, checked } = useStaffLive();
  const [liveRiders, setLiveRiders] = useState<Rider[] | null>(null);
  const [settleClaims, setSettleClaims] = useState<SettleClaim[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ riders: Rider[]; settleClaims?: SettleClaim[] }>(
        "/api/admin/riders",
      );
      setLiveRiders(data.riders);
      setSettleClaims(data.settleClaims ?? []);
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
      setSettleClaims([]);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);
  // Online flags, load and cash-in-hand change from the rider app; the
  // dispatch board read them once and painted a stale roster (2026-09-18).
  usePoll(refresh, pollMs, live && pollMs > 0);

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

  /**
   * Staff password reset for the rider's linked login — answers the
   * temporary password once (apply = sign up, 2026-09-26: no e-mail reset).
   */
  const resetRiderPassword = useCallback(
    async (id: string): Promise<string | null> => {
      if (!live) return null;
      try {
        const data = await apiSend<{ password: string }>(
          `/api/admin/riders/${encodeURIComponent(id)}/reset-password`,
          "POST",
          {},
        );
        setError(null);
        return data.password;
      } catch (err) {
        setError(apiErrorMessage(err));
        return null;
      }
    },
    [live],
  );

  /** Staff reject a rider's pending settle claim (money never arrived). */
  const rejectClaim = useCallback(
    async (id: string, note: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/riders/${encodeURIComponent(id)}/settle-claim`,
          "POST",
          { action: "reject", note },
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

  const riders: Rider[] = liveRiders ?? [];
  return {
    riders,
    pending: riders.filter((r) => r.status === "pending"),
    settleClaims,
    saveRider,
    setStatus,
    settleCash,
    rejectClaim,
    linkRider,
    resetRiderPassword,
    reset: refresh,
    live,
    loading: live && (!checked || liveRiders === null),
    error,
    clearError: () => setError(null),
  };
}
