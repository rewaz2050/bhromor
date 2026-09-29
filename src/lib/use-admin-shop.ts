"use client";

/**
 * C3 (2026-09-29) — one shop's file for the admin detail page.
 *
 * Live only, and quiet about why it is empty: an unconfigured backend, a
 * missing shop and a shop with no orders are three different things, and the
 * page says which one it is.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet } from "./admin-api";
import type { AdminShopDetail } from "./db/admin-shop";
import type { Shop } from "./catalog";
import { useStaffLive } from "./use-staff-live";

export interface AdminShopState {
  detail: AdminShopDetail | null;
  shop: Shop | null;
  loading: boolean;
  /** "not-found" is its own state: an empty page must not look like a quiet shop. */
  missing: boolean;
  error: string | null;
  live: boolean;
  refresh: () => Promise<boolean>;
}

export function useAdminShop(shopId: string | undefined): AdminShopState {
  const { live } = useStaffLive();
  const [detail, setDetail] = useState<AdminShopDetail | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!shopId) return false;
    setLoading(true);
    try {
      const data = await apiGet<{ detail: AdminShopDetail; shop: Shop }>(
        `/api/admin/shops/${encodeURIComponent(shopId)}`,
      );
      setDetail(data.detail ?? null);
      setShop(data.shop ?? data.detail?.shop ?? null);
      setMissing(false);
      setError(null);
      return true;
    } catch (err) {
      const message = apiErrorMessage(err);
      setMissing(/not on prosanti|that shop/i.test(message));
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (!live || !shopId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read
    void refresh();
  }, [live, shopId, refresh]);

  return { detail, shop, loading, missing, error, live, refresh };
}
