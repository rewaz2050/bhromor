"use client";

/**
 * Admin shop data — live only. Reads/writes go through /api/admin/shops.
 * Public discovery uses /api/shops, never this.
 */

import { useCallback, useEffect, useState } from "react";
import type { Shop } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export interface AdminShopClient extends Shop {
  productCount: number;
  /** A vendor login is attached (applications arrive linked since 2026-09-26). */
  vendorLinked?: boolean;
}

export function useShops() {
  const { live, checked } = useStaffLive();
  const [liveShops, setLiveShops] = useState<AdminShopClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ shops: AdminShopClient[] }>(
        "/api/admin/shops",
      );
      setLiveShops(data.shops);
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
      setLiveShops(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveShop = useCallback(
    async (s: Shop): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend("/api/admin/shops", "POST", s);
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

  /**
   * Round 4 — approve / reject / suspend / re-open through the review
   * endpoint, which stamps who decided and when and stores the reason a
   * rejected applicant reads on their login page.
   */
  const setStatus = useCallback(
    async (id: string, status: Shop["status"], note?: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/shops/${encodeURIComponent(id)}/review`,
          "POST",
          { status, note: note ?? "" },
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

  /** Link an Auth account as the shop's vendor owner. */
  const linkVendor = useCallback(
    async (id: string, email: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/shops/${encodeURIComponent(id)}/link-vendor`,
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
   * Staff password reset for the shop's linked login — answers the
   * temporary password once (apply = sign up, 2026-09-26: no e-mail reset).
   */
  const resetVendorPassword = useCallback(
    async (id: string): Promise<string | null> => {
      if (!live) return null;
      try {
        const data = await apiSend<{ password: string }>(
          `/api/admin/shops/${encodeURIComponent(id)}/reset-password`,
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

  const shops: AdminShopClient[] = liveShops ?? [];
  return {
    shops,
    pending: shops.filter((s) => s.status === "pending"),
    saveShop,
    setStatus,
    linkVendor,
    resetVendorPassword,
    reset: refresh,
    live,
    loading: live && (!checked || liveShops === null),
    error,
    clearError: () => setError(null),
  };
}
