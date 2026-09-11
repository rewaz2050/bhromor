"use client";

/**
 * Admin order data — live only. Staff sessions read/write through
 * /api/admin/orders (database §34 machine).
 */

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderStatus } from "./orders";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useOrders() {
  const { live, checked } = useStaffLive();
  const [liveOrders, setLiveOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ orders: Order[] }>("/api/admin/orders");
      setLiveOrders(data.orders);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
    // Free real-time polling every 10s — admin sees new orders instantly without cost
    const id = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  const advance = useCallback(
    async (
      id: string,
      to: OrderStatus,
      note?: string,
    ): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend<{ order: Order }>(
          `/api/admin/orders/${encodeURIComponent(id)}/advance`,
          "POST",
          { to, note },
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

  const cancel = useCallback(
    (id: string): Promise<boolean> => advance(id, "cancelled"),
    [advance],
  );

  return {
    orders: live ? (liveOrders ?? []) : [],
    advance,
    cancel,
    reset: refresh,
    /** Live/staff mode, stored API error, and first-load state. */
    live,
    loading: live && (!checked || liveOrders === null),
    error,
    clearError: () => setError(null),
    refresh,
  };
}
