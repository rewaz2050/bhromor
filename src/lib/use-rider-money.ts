"use client";

/**
 * Rider earnings data (202609300002 — audit item N). One fetch answers the
 * whole statement: server-computed totals (today / week / lifetime), the
 * journal feed and the payout history. `requestPayout` files a withdrawal
 * and hands back the refreshed statement so the page never shows a stale
 * balance after the money has moved.
 */

import { useCallback, useEffect, useState } from "react";
import { riderFetch } from "./use-rider";

export type RiderMoneyKind =
  | "tip"
  | "delivery_fee"
  | "cod_handling"
  | "incentive"
  | "payout"
  | "payout_refund"
  | "adjustment";

export interface RiderMoneySummaryView {
  balance: number;
  cashInHand: number;
  today: number;
  week: number;
  lifetime: number;
  tips: number;
  deliveryFees: number;
  codHandling: number;
  incentives: number;
  paidOut: number;
  pendingPayout: number;
  deliveriesToday: number;
  baseFee: number;
  codHandlingFee: number;
  minPayout: number;
}

export interface RiderMoneyEntryView {
  id: string;
  kind: RiderMoneyKind;
  amount: number;
  note: string;
  at: number;
  orderId?: string;
  payoutId?: string;
}

export interface RiderPayoutView {
  id: string;
  amount: number;
  method: string;
  account: string;
  status: "pending" | "paid" | "rejected";
  requestedAt: number;
  decidedAt?: number;
  note?: string;
  reference: string;
}

export interface RiderMoneySnapshot {
  ready: boolean;
  summary: RiderMoneySummaryView | null;
  entries: RiderMoneyEntryView[];
  payouts: RiderPayoutView[];
}

export function useRiderEarnings(enabled: boolean) {
  const [data, setData] = useState<RiderMoneySnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    try {
      const snapshot = await riderFetch<RiderMoneySnapshot>("/api/rider/earnings");
      setData(snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your earnings.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    setLoading(true);
    void refresh();
  }, [enabled, refresh]);

  const requestPayout = useCallback(
    async (input: {
      amountTaka: number;
      method: string;
      account: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        await riderFetch<{ payout: RiderPayoutView }>(
          "/api/rider/earnings",
          "POST",
          input,
        );
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not file the request.",
        };
      }
    },
    [refresh],
  );

  return {
    ready: data?.ready ?? false,
    summary: data?.summary ?? null,
    entries: data?.entries ?? [],
    payouts: data?.payouts ?? [],
    loading,
    error,
    refresh,
    requestPayout,
  };
}
