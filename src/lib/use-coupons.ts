"use client";

/**
 * Admin coupon data — live only. Coupons read/write through
 * /api/admin/coupons; checkout validates codes through
 * POST /api/coupons/validate instead — staff endpoints never serve the
 * storefront.
 */

import { useCallback, useEffect, useState } from "react";
import type { Coupon } from "./coupons";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useCoupons() {
  const { live, checked } = useStaffLive();
  const [liveCoupons, setLiveCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ coupons: Coupon[] }>("/api/admin/coupons");
      setLiveCoupons(data.coupons);
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
      setLiveCoupons(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const save = useCallback(
    async (c: Coupon): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend("/api/admin/coupons", "POST", c);
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

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!live) return;
      try {
        await apiSend(
          `/api/admin/coupons/${encodeURIComponent(id)}`,
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

  /** Usage is recorded by the order RPC in live mode — no client record. */
  const recordUse = useCallback((_code: string) => {}, []);

  return {
    coupons: liveCoupons ?? [],
    save,
    remove,
    recordUse,
    reset: refresh,
    live,
    loading: live && (!checked || liveCoupons === null),
    error,
    clearError: () => setError(null),
  };
}
