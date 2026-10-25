"use client";

/**
 * Admin → Money data (202609300002 — audit item M): the platform money
 * position, the rider payout queue and the rider pay rates. Staff-only, live
 * only: without a staff session the page says so instead of inventing
 * balances.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { MoneyPnl, PnlRange } from "./money-pnl";

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
  const [settled, setSettled] = useState(false);
  const [reading, setReading] = useState(false);
  const [completedRange, setCompletedRange] = useState<PnlRange | null>(null);
  const [pnlRange, setPnlRange] = useState<PnlRange | null>(null);
  const [backendMissing, setBackendMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<AdminMoneySummaryView | null>(null);
  const [pending, setPending] = useState<RiderPayoutQueueRowView[]>([]);
  const [decided, setDecided] = useState<RiderPayoutQueueRowView[]>([]);
  const [settings, setSettings] = useState<RiderPaySettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Net P&L window (202610010003); null can mean missing schema or an unavailable read.
  const [range, setRange] = useState<PnlRange>("30d");
  const [pnl, setPnl] = useState<MoneyPnl | null>(null);

  const context = useRef({ live: false, range, request: 0 });
  useEffect(() => {
    const state = context.current;
    state.live = live;
    state.range = range;
    return () => { state.live = false; state.request++; };
  }, [live, range]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const state = context.current;
    if (!live || !state.live || state.range !== range) return false;
    const request = ++state.request;
    setReading(true);
    try {
      const data = await apiGet<{
        pnl?: MoneyPnl | null;
        ready: boolean;
        summary: AdminMoneySummaryView | null;
        queue: { pending: RiderPayoutQueueRowView[]; decided: RiderPayoutQueueRowView[] } | null;
        settings: RiderPaySettingsView;
      }>(`/api/admin/money?range=${range}`);
      if (request !== state.request) return false;
      setPnl(data.pnl ?? null);
      setPnlRange(range);
      setReady(data.ready);
      setBackendMissing(data.ready === false);
      setSummary(data.summary);
      setPending(data.queue?.pending ?? []);
      setDecided(data.queue?.decided ?? []);
      setSettings(data.settings);
      setError(null);
      return true;
    } catch (err) {
      if (request !== state.request) return false;
      setError(apiErrorMessage(err));
      return false;
    } finally {
      if (state.live && request === state.request) {
        setReading(false);
        setSettled(true);
        setCompletedRange(range);
      }
    }
  }, [live, range]);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setSummary(null);
      setSettled(false);
      setReading(false);
      setCompletedRange(null);
      setPnlRange(null);
      setReady(false);
      setBackendMissing(false);
      setPending([]);
      setDecided([]);
      setSettings(null);
      setPnl(null);
      setError(null);
      return;
    }
    setError(null);
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
    loading: live && (!checked || !settled),
    ready,
    backendMissing: live && backendMissing,
    summary,
    pnl: live && pnlRange === range ? pnl : null,
    pnlLoading: live && (reading || completedRange !== range),
    range,
    setRange,
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
