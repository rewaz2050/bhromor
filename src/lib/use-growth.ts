"use client";

/**
 * Admin growth data — price-drop watchers + the referral ledger + the live
 * state of the automatic offers. Settings themselves stay in `useSettings`,
 * so there is exactly one document that decides money.
 */

import { useCallback, useEffect, useState } from "react";
import type { PromoView } from "./promos";
import { apiErrorMessage, apiGet } from "./admin-api";

export interface GrowthWatch {
  id: string;
  productId: string;
  productName: string;
  phone: string;
  targetPaisa: number | null;
  createdAt: string;
}

export interface GrowthCode {
  code: string;
  name: string;
  phone: string;
  createdAt: string;
  invited: number;
  credited: number;
}

export interface GrowthReward {
  code: string;
  referee_phone: string;
  friend_credit: number;
  referrer_reward: number;
  referrer_coupon_id: string | null;
  created_at: string;
}

export interface GrowthData {
  watches: GrowthWatch[];
  codes: GrowthCode[];
  rewards: GrowthReward[];
  promos: PromoView;
}

const EMPTY: GrowthData = {
  watches: [],
  codes: [],
  rewards: [],
  promos: {
    flash: {
      enabled: false,
      title: "",
      discountPct: 0,
      slots: [],
      scope: "featured",
      productIds: [],
      maxDiscountPaisa: 0,
      active: false,
      msLeft: 0,
      endsAtMs: null,
      nextStartsAtMs: null,
      progress: 0,
      asOf: 0,
    },
    bundle: { enabled: false, name: "", discountPct: 0, maxItems: 0 },
  },
};

export function useGrowth() {
  const [data, setData] = useState<GrowthData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<GrowthData>("/api/admin/growth");
      setData(next);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch per mount
    void refresh();
  }, [refresh]);

  return { ...data, loading, error, refresh };
}
