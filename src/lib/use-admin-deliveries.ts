"use client";

/**
 * Admin → Deliveries board hook (phase 3, slice 7) — live only.
 * Reads/writes `/api/admin/deliveries*`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RIDERS_POLL_MS, useRiders } from "./use-riders";
import { usePoll } from "./use-poll";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { FailedDelivery, RiderDispatchJob } from "./db/riders";
import type { Order } from "./orders";

/** Board refresh while visible — an offer lives 90 s, so 15 s shows each
 *  hop (offered → accepted → picked up) without a manual reload. */
export const DELIVERIES_POLL_MS = 15_000;

export function useAdminDeliveries() {
  const { live, loading, error: ridersError, riders, dispatch, reset: resetRiders } = useRiders(RIDERS_POLL_MS);
  const [liveJobs, setLiveJobs] = useState<RiderDispatchJob[] | null>(null);
  const [liveAwaiting, setLiveAwaiting] = useState<Order[]>([]);
  const [liveFailed, setLiveFailed] = useState<FailedDelivery[]>([]);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Invalidate reads on sign-out/unmount; only the newest request may commit.
  // Immutable identity is captured by callbacks; saved callbacks from a previous
  // enabled lifetime cannot start work using the next staff lifetime's state.
  const mutationLifetime = useMemo(() => Symbol(live ? "active delivery mutations" : "inactive delivery mutations"), [live]);
  const lifecycle = useRef({ live: false, request: 0, mutation: 0, lifetime: mutationLifetime });
  useEffect(() => {
    const state = lifecycle.current;
    state.live = live;
    state.lifetime = mutationLifetime;
    state.mutation++;
    return () => { state.live = false; state.request++; state.mutation++; };
  }, [live, mutationLifetime]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const state = lifecycle.current;
    if (!state.live) return false;
    const request = ++state.request;
    try {
      const data = await apiGet<{
        deliveries: RiderDispatchJob[];
        awaitingOrders: Order[];
        failedDeliveries?: FailedDelivery[];
      }>("/api/admin/deliveries");
      if (request !== state.request) return false;
      setLiveJobs(data.deliveries);
      setLiveAwaiting(data.awaitingOrders);
      setLiveFailed(data.failedDeliveries ?? []);
      setError(null);
      return true;
    } catch (err) {
      if (request !== state.request) return false;
      setError(apiErrorMessage(err));
      return false;
    } finally {
      if (request === state.request) setSettled(true);
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear prior staff session's dispatch snapshot
      setLiveJobs(null);
      setSettled(false);
      setLiveAwaiting([]);
      setLiveFailed([]);
      setError(null);
      setBusyId(null);
      return;
    }
    void refresh();
  }, [live, refresh]);
  // Until 2026-09-18 the board loaded once: staff watched a stale "Offered"
  // row until they reloaded. Paused while the tab is hidden (use-poll.ts).
  usePoll(refresh, DELIVERIES_POLL_MS, live);

  /** The latest action owns UI completion, not the server-side write. A stale
   * result returns false without refreshing/clearing another lifetime's state.
   * Requests already sent are not cancelled, retried or rolled back here. */
  const mutate = useCallback(async (
    id: string,
    send: () => Promise<unknown>,
  ): Promise<boolean> => {
    const state = lifecycle.current;
    if (!state.live || state.lifetime !== mutationLifetime) return false;
    const mutation = ++state.mutation;
    const current = () => state.live && state.lifetime === mutationLifetime && state.mutation === mutation;
    setBusyId(id);
    try {
      await send();
      if (!current()) return false;
      setError(null);
      await refresh();
      return current();
    } catch (err) {
      if (current()) setError(apiErrorMessage(err));
      return false;
    } finally {
      if (current()) setBusyId(null);
    }
  }, [mutationLifetime, refresh]);

  const offer = useCallback(
    (orderId: string): Promise<boolean> => mutate(orderId, () =>
      apiSend<{ id: string }>("/api/admin/deliveries/offer", "POST", { orderId })),
    [mutate],
  );

  const cancel = useCallback(
    async (id: string): Promise<boolean> => {
      const target = liveJobs?.find((j) => j.id === id);
      if (!target || target.state !== "offered") return false;
      return mutate(id, () => apiSend<{ ok: boolean }>(
        `/api/admin/deliveries/${encodeURIComponent(id)}/cancel`, "POST"));
    },
    [liveJobs, mutate],
  );

  /** Take an accepted / picked-up job away from an unresponsive rider. */
  const release = useCallback(
    (id: string, reason: string): Promise<boolean> => mutate(id, () =>
      apiSend<{ ok: boolean }>(
        `/api/admin/deliveries/${encodeURIComponent(id)}/release`, "POST", { reason })),
    [mutate],
  );

  /** Redispatch or cancel an order whose final delivery attempt failed. */
  const resolveFailed = useCallback(
    (orderId: string, action: "redispatch" | "cancel", note = "", payFee = false): Promise<boolean> =>
      mutate(orderId, () => apiSend<{ ok: boolean }>(
        `/api/admin/orders/${encodeURIComponent(orderId)}/failed-delivery`,
        "POST", { action, note, ...(payFee ? { payFee: true } : {}) })),
    [mutate],
  );

  // Manual recovery must retry the dependency that supplied the displayed error.
  const retry = useCallback(async (): Promise<boolean> => {
    const [boardOk, rosterOk] = await Promise.all([
      refresh(), ridersError ? resetRiders() : Promise.resolve(true),
    ]);
    return boardOk && rosterOk;
  }, [refresh, ridersError, resetRiders]);

  const deliveries: RiderDispatchJob[] = liveJobs ?? [];
  const awaitingOrders: Order[] = liveAwaiting;
  const loadingDeliveries = live && (loading || !settled);

  return {
    deliveries,
    riders,
    dispatch,
    ridersLoading: loading,
    awaitingOrders,
    failedDeliveries: liveFailed,
    resolveFailed,
    release,
    live,
    loading: loadingDeliveries,
    error: error ?? ridersError,
    clearError: () => setError(null),
    busyId,
    refresh: retry,
    offer,
    cancel,
  };
}
