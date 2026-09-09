"use client";

/**
 * Admin → Deliveries board hook (phase 3, slice 7).
 *
 * Live mode reads/writes `/api/admin/deliveries*`. Demo mode derives a
 * read-only preview from the browser-local order + rider stores so the
 * board still works without Supabase; offer/cancel are simulated locally.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrders } from "./use-orders";
import { useRiders } from "./use-riders";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { isSupabaseConfigured } from "./env";
import type { RiderDispatchJob } from "./db/riders";
import type { Order } from "./orders";

const demoState = (status: Order["status"]): RiderDispatchJob["state"] => {
  if (status === "out-for-delivery") return "picked_up";
  if (status === "courier-assigned") return "accepted";
  if (status === "delivered") return "delivered";
  return "offered";
};

const demoJob = (
  order: Order,
  riderId: string,
  riderName: string,
  riderPhone: string,
): RiderDispatchJob => ({
  id: order.id,
  orderId: order.id,
  riderId,
  riderName,
  riderPhone,
  state: demoState(order.status),
  offeredAt: Date.now(),
  expiresAt: Date.now() + 90_000,
  order,
});

export function useAdminDeliveries() {
  const { orders: demoOrders, advance } = useOrders();
  const { riders: demoRiders, live, loading, error: ridersError } = useRiders();
  const [liveJobs, setLiveJobs] = useState<RiderDispatchJob[] | null>(null);
  const [liveAwaiting, setLiveAwaiting] = useState<Order[]>([]);
  const [demoOverrides, setDemoOverrides] = useState<RiderDispatchJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoBusyId, setDemoBusyId] = useState<string | null>(null);

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
    if (!isSupabaseConfigured() || !live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
  }, [live, refresh]);

  const demoJobs = useMemo<RiderDispatchJob[]>(() => {
    const first = demoRiders.find((r) => r.status === "active") ?? demoRiders[0];
    if (!first) return demoOverrides;
    const base = demoOrders
      .filter((o) =>
        [
          "ready-for-pickup",
          "courier-assigned",
          "out-for-delivery",
          "delivered",
        ].includes(o.status),
      )
      .map((o) => demoJob(o, first.id, first.name, first.phone));
    const overrides = demoOverrides.map((j) => {
      const order = demoOrders.find((o) => o.id === j.orderId);
      return order ? demoJob(order, j.riderId, j.riderName, j.riderPhone) : j;
    });
    const merged = new Map<string, RiderDispatchJob>();
    for (const j of [...overrides, ...base]) merged.set(j.id, j);
    return [...merged.values()].sort((a, b) => b.offeredAt - a.offeredAt);
  }, [demoOrders, demoRiders, demoOverrides]);

  const offer = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!isSupabaseConfigured() || !live) {
        setDemoBusyId(orderId);
        try {
          const order = demoOrders.find((o) => o.id === orderId);
          const rider =
            demoRiders.find((r) => r.status === "active") ?? demoRiders[0];
          if (!order || !rider) {
            setError("No eligible rider in the demo store — approve a rider first.");
            return false;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          setDemoOverrides((prev) => [
            ...prev.filter((j) => j.orderId !== orderId),
            demoJob(order, rider.id, rider.name, rider.phone),
          ]);
          setError(null);
          return true;
        } finally {
          setDemoBusyId(null);
        }
      }
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
      }
    },
    [demoOrders, demoRiders, live, refresh],
  );

  const cancel = useCallback(
    async (id: string): Promise<boolean> => {
      const target = (live ? liveJobs : demoJobs)?.find((j) => j.id === id);
      if (!target || target.state === "delivered") return false;
      if (!isSupabaseConfigured() || !live) {
        setDemoBusyId(id);
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          setDemoOverrides((prev) =>
            prev.filter((j) => j.id !== id).concat({
              ...target,
              state: "cancelled",
            }),
          );
          setError(null);
          return true;
        } finally {
          setDemoBusyId(null);
        }
      }
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
      }
    },
    [live, liveJobs, demoJobs, refresh],
  );

  const deliveries: RiderDispatchJob[] = live
    ? liveJobs ?? []
    : demoJobs.filter((j) => j.state !== "cancelled");

  const demoAwaiting = useMemo<Order[]>(() => {
    const assigned = new Set(
      demoJobs
        .filter((j) => j.state !== "cancelled" && j.state !== "delivered")
        .map((j) => j.orderId),
    );
    return demoOrders
      .filter(
        (o) =>
          ["ready-for-pickup", "courier-assigned", "out-for-delivery"].includes(
            o.status,
          ) && !assigned.has(o.id),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [demoOrders, demoJobs]);

  const awaitingOrders: Order[] = live ? liveAwaiting : demoAwaiting;
  const loadingDeliveries = live && (loading || liveJobs === null);

  return {
    deliveries,
    awaitingOrders,
    live,
    loading: loadingDeliveries,
    error: error ?? ridersError,
    clearError: () => setError(null),
    busyId: demoBusyId,
    refresh,
    offer,
    cancel,
    advanceDemo: advance,
  };
}
