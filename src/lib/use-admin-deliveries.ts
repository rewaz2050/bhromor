"use client";

/**
 * Admin → Deliveries board hook (phase 3, slice 7) — live only.
 * Reads/writes `/api/admin/deliveries*`.
 */

import { useCallback, useEffect, useState } from "react";
import { useRiders } from "./use-riders";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { RiderDispatchJob } from "./db/riders";
import type { Order } from "./orders";

export function useAdminDeliveries() {
  const { live, loading, error: ridersError } = useRiders();
  const [liveJobs, setLiveJobs] = useState<RiderDispatchJob[] | null>(null);
  const [liveAwaiting, setLiveAwaiting] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{
        deliveries: RiderDispatchJob[];
        awaitingOrders: Order[];
      }>("/api/admin/deliveries");
      setLiveJobs(data.deliveries);
      setLiveAwaiting(data.awaitingOrders);
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
  }, [live, refresh]);

  const offer = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!live) return false;
      setBusyId(orderId);
      try {
        await apiSend<{ id: string }>("/api/admin/deliveries/offer", "POST", {
          orderId,
        });
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [live, refresh],
  );

  const cancel = useCallback(
    async (id: string): Promise<boolean> => {
      if (!live) return false;
      const target = liveJobs?.find((j) => j.id === id);
      if (!target || target.state === "delivered") return false;
      setBusyId(id);
      try {
        await apiSend<{ ok: boolean }>(
          `/api/admin/deliveries/${encodeURIComponent(id)}/cancel`,
          "POST",
        );
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [live, liveJobs, refresh],
  );

  const deliveries: RiderDispatchJob[] = liveJobs ?? [];
  const awaitingOrders: Order[] = liveAwaiting;
  const loadingDeliveries = live && (loading || liveJobs === null);

  return {
    deliveries,
    awaitingOrders,
    live,
    loading: loadingDeliveries,
    error: error ?? ridersError,
    clearError: () => setError(null),
    busyId,
    refresh,
    offer,
    cancel,
  };
}
