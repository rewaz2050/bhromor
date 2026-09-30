"use client";

/**
 * Admin → Money data (202609300002 — audit item M): the platform money
 * position, the rider payout queue and the rider pay rates. Staff-only, live
 * only: without a staff session the page says so instead of inventing
 * balances.
 */

import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export interface AdminMoneySummaryView {
  commissionIncome: number;
  deliveryIncome: number;
  tipsCollected: number;
  tipsToRiders: number;
  riderFeesEarned: number;
  deliveredOrders: number;
  riderPayable: number;
  riderPayoutsPending: number;
  riderPayoutsPendingCount: number;
  riderPayoutsPaid: number;
  shopPayable: number;
  codCustody: number;
  codClaimsPending: number;
  activeRiders: number;
  onlineRiders: number;
  baseFee: number;
  codHandlingFee: number;
  minPayout: number;
}

export interface RiderPayoutQueueRowView {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  amount: number;
  method: string;
  account: string;
  status: "pending" | "paid" | "rejected";
  requestedAt: number;
  decidedAt?: number;
  note?: string;
  reference: string;
  earningsBalance: number;
  cashInHand: number;
}

export interface RiderPaySettingsView {
  baseFee: number;
  codHandlingFee: number;
  minPayout: number;
}

export function useAdminMoney() {
  const { live, checked } = useStaffLive();
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<AdminMoneySummaryView | null>(null);
  const [pending, setPending] = useState<RiderPayoutQueueRowView[]>([]);
  const [decided, setDecided] = useState<RiderPayoutQueueRowView[]>([]);
  const [settings, setSettings] = useState<RiderPaySettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{
        ready: boolean;
        summary: AdminMoneySummaryView | null;
        queue: { pending: RiderPayoutQueueRowView[]; decided: RiderPayoutQueueRowView[] } | null;
        settings: RiderPaySettingsView;
      }>("/api/admin/money");
      setReady(data.ready);
      setSummary(data.summary);
      setPending(data.queue?.pending ?? []);
      setDecided(data.queue?.decided ?? []);
      setSettings(data.settings);
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
      setSummary(null);
      setPending([]);
      setDecided([]);
      setSettings(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const decide = useCallback(
    async (input: {
      payoutId: string;
      decision: "paid" | "rejected";
      note?: string;
      reference?: string;
    }): Promise<boolean> => {
      try {
        await apiSend("/api/admin/money", "POST", input);
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  const saveSettings = useCallback(
    async (next: RiderPaySettingsView): Promise<boolean> => {
      try {
        await apiSend("/api/admin/money", "PATCH", { settings: next });
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  return {
    live,
    loading: live && (!checked || settings === null),
    ready,
    summary,
    pending,
    decided,
    settings,
    error,
    clearError: () => setError(null),
    refresh,
    decide,
    saveSettings,
  };
}
