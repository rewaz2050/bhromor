"use client";

/**
 * Admin coupon data with live cutover (see use-orders.ts).
 * Checkout validates codes through POST /api/coupons/validate instead —
 * staff endpoints must never serve the storefront.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  deleteCouponInStore,
  getCoupons,
  getCouponsServer,
  recordCouponUseInStore,
  resetCoupons,
  saveCouponInStore,
  subscribeCoupons,
} from "./coupons-store";
import type { Coupon } from "./coupons";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useCoupons() {
  const demoCoupons = useSyncExternalStore(
    subscribeCoupons,
    getCoupons,
    getCouponsServer,
  );
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveCoupons(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const save = useCallback(
    async (c: Coupon): Promise<boolean> => {
      if (!live) {
        saveCouponInStore(c);
        return true;
      }
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
      if (!live) {
        deleteCouponInStore(id);
        return;
      }
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

  /** Usage is recorded by the order RPC in live mode — demo only here. */
  const recordUse = useCallback(
    (code: string) => {
      if (!live) recordCouponUseInStore(code);
    },
    [live],
  );

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetCoupons();
  }, [live, refresh]);

  return {
    coupons: live ? (liveCoupons ?? []) : demoCoupons,
    save,
    remove,
    recordUse,
    reset,
    live,
    loading: live && (!checked || liveCoupons === null),
    error,
    clearError: () => setError(null),
  };
}
