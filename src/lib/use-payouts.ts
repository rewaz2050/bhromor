"use client";

/**
 * Staff payout data (marketplace phase 2, slice 5) — live only.
 * Settlement money has no demo: without a staff session the page says
 * so instead of inventing balances.
 */

import { useCallback, useEffect, useState } from "react";
import type { Shop } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/** Client mirrors of the db/admin settlement shapes (server-only). */
export interface ShopBalanceClient {
  shop: Shop;
  earned: number;
  paid: number;
  balance: number;
  lastPayoutAt: number | null;
}

export interface LedgerLineClient {
  id: string;
  shopId: string;
  orderId: string;
  orderNo: string;
  subtotal: number;
  commission: number;
  payable: number;
  at: number;
}

export interface PayoutLineClient {
  id: string;
  shopId: string;
  amount: number;
  method: string;
  reference: string;
  at: number;
}

export function usePayouts(shopId: string | null) {
  const { live, checked } = useStaffLive();
  const [balances, setBalances] = useState<ShopBalanceClient[] | null>(null);
  const [ledger, setLedger] = useState<LedgerLineClient[]>([]);
  const [payouts, setPayouts] = useState<PayoutLineClient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{
        balances: ShopBalanceClient[];
        ledger?: LedgerLineClient[];
        payouts?: PayoutLineClient[];
      }>(
        shopId
          ? `/api/admin/payouts?shop=${encodeURIComponent(shopId)}`
          : "/api/admin/payouts",
      );
      setBalances(data.balances);
      setLedger(data.ledger ?? []);
      setPayouts(data.payouts ?? []);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, [shopId]);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setBalances(null);
      setLedger([]);
      setPayouts([]);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const record = useCallback(
    async (input: {
      shopId: string;
      amountTaka: number;
      method: string;
      reference: string;
    }): Promise<boolean> => {
      try {
        await apiSend("/api/admin/payouts", "POST", input);
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
    loading: live && (!checked || balances === null),
    balances: balances ?? [],
    ledger,
    payouts,
    error,
    clearError: () => setError(null),
    record,
    refresh,
  };
}
