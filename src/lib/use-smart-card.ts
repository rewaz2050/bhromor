"use client";

/**
 * The signed-in customer's Smart Card (stamp card) — live only.
 * GET /api/account/card (server counts this phone's orders).
 * Signed-out → card === null; the UI shows the join teaser instead.
 */

import { useEffect, useState } from "react";
import { useCustomer } from "./use-customer";

export interface SmartCard {
  stamps: number;
  orderCount: number;
  target: number;
  cycles: number;
  unlocked: boolean;
  revealed: boolean;
  enabled: boolean;
  rewardTitle: string;
  rewardDescription: string;
  /** Stamp count once the cart's next order lands (stamps + 1, cycle-aware). */
  afterOrderStamps: number;
}

export function useSmartCard(): {
  card: SmartCard | null;
  signedIn: boolean;
  loading: boolean;
} {
  const { customer, mode, checked } = useCustomer();
  const [liveState, setLiveState] = useState<{
    key: string;
    card: SmartCard | null;
    error: boolean;
  }>({ key: "", card: null, error: false });

  useEffect(() => {
    if (mode !== "live" || !customer) return;
    const key = customer.id;
    let cancelled = false;
    void fetch("/api/account/card", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          card: {
            stamps: number;
            orderCount: number;
            target: number;
            cycles: number;
            unlocked: boolean;
            revealed: boolean;
            enabled: boolean;
            minOrderTaka: number;
            reward: { title: string; description: string };
          };
        };
        const target = Math.max(1, body.card.target);
        const card: SmartCard = {
          stamps: body.card.stamps,
          orderCount: body.card.orderCount,
          target,
          cycles: body.card.cycles,
          unlocked: body.card.unlocked,
          revealed: body.card.revealed,
          enabled: body.card.enabled,
          rewardTitle: body.card.reward.title,
          rewardDescription: body.card.reward.description,
          afterOrderStamps:
            body.card.stamps >= target ? 1 : body.card.stamps + 1,
        };
        if (!cancelled) setLiveState({ key, card, error: false });
      })
      .catch(() => {
        if (!cancelled) setLiveState({ key, card: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, customer]);
  const liveCard = liveState.key === (customer?.id ?? "") ? liveState.card : null;
  const liveError =
    liveState.key === (customer?.id ?? "") ? liveState.error : false;

  if (!checked) return { card: null, signedIn: false, loading: true };
  if (!customer) return { card: null, signedIn: false, loading: false };
  return {
    card: liveCard,
    signedIn: true,
    loading: !liveCard && !liveError,
  };
}
