"use client";

/**
 * Admin shop data with live cutover (see use-orders.ts).
 * Staff queue reads/writes through /api/admin/shops when live, else the
 * browser-local demo store. Public discovery uses /api/shops, never this.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getShops,
  getShopsServer,
  resetShopStore,
  saveShopInStore,
  subscribeShops,
} from "./shops-store";
import type { Shop } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export interface AdminShopClient extends Shop {
  productCount: number;
}

const withCount = (s: Shop): AdminShopClient => ({ ...s, productCount: 0 });

export function useShops() {
  const demoShops = useSyncExternalStore(
    subscribeShops,
    getShops,
    getShopsServer,
  );
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveShops(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveShop = useCallback(
    async (s: Shop): Promise<boolean> => {
      if (!live) {
        saveShopInStore(s);
        return true;
      }
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

  const setStatus = useCallback(
    async (id: string, status: Shop["status"]): Promise<boolean> => {
      const current = (live ? liveShops : demoShops)?.find((s) => s.id === id);
      if (!current) return false;
      return saveShop({ ...current, status });
    },
    [live, liveShops, demoShops, saveShop],
  );

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetShopStore();
  }, [live, refresh]);

  const shops: AdminShopClient[] = live
    ? (liveShops ?? [])
    : demoShops.map(withCount);
  return {
    shops,
    pending: shops.filter((s) => s.status === "pending"),
    saveShop,
    setStatus,
    reset,
    live,
    loading: live && (!checked || liveShops === null),
    error,
    clearError: () => setError(null),
  };
}
