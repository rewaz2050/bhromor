"use client";

/**
 * Admin order data with live cutover. Staff sessions read/write through
 * /api/admin/orders (database §34 machine); everything else keeps the
 * browser-local demo store. `useLocalOrders` is the demo store alone —
 * the public Track page must never touch staff endpoints.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  advanceOrderInStore,
  getOrders,
  resetOrderStore,
  subscribeOrders,
} from "./order-store";
import type { Order, OrderStatus } from "./orders";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useLocalOrders() {
  const orders = useSyncExternalStore(subscribeOrders, getOrders, getOrders);
  return { orders };
}

export function useOrders() {
  const demoOrders = useSyncExternalStore(
    subscribeOrders,
    getOrders,
    getOrders,
  );
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
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveOrders(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const advance = useCallback(
    async (
      id: string,
      to: OrderStatus,
      note?: string,
    ): Promise<boolean> => {
      if (!live) return advanceOrderInStore(id, to, note);
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

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetOrderStore();
  }, [live, refresh]);

  return {
    orders: live ? (liveOrders ?? []) : demoOrders,
    advance,
    cancel,
    reset,
    /** Live/staff mode, stored API error, and first-load state. */
    live,
    loading: live && (!checked || liveOrders === null),
    error,
    clearError: () => setError(null),
    refresh,
  };
}
