"use client";

/**
 * The signed-in customer's Smart Card (stamp card).
 * Live → GET /api/account/card (server counts this phone's orders).
 * Demo → browser-local orders + settings through the shared calculator.
 * Signed-out → card === null; the UI shows the join teaser instead.
 */

import { useEffect, useMemo, useState } from "react";
import { useCustomer } from "./use-customer";
import { useSettings } from "./use-settings";
import { useLocalOrders } from "./use-orders";
import { calculateLoyaltyProgress } from "./loyalty";
import { samePhone } from "./orders";

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
  const { orders } = useLocalOrders();
  const { settings } = useSettings();
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

  const demoCard = useMemo(() => {
    if (mode !== "demo" || !customer) return null;
    const mine = orders.filter(
      (o) => o.status !== "cancelled" && samePhone(o.customer?.phone ?? "", customer.phone),
    );
    const progress = calculateLoyaltyProgress(mine, settings, {
      phone: customer.phone,
    });
    const card: SmartCard = {
      stamps: progress.currentStamps,
      orderCount: progress.totalDelivered,
      target: progress.targetOrders,
      cycles: progress.completedCycles,
      unlocked: progress.isUnlocked,
      revealed: progress.prizeRevealed,
      enabled: progress.enabled,
      rewardTitle: progress.rewardTitle,
      rewardDescription: progress.rewardDescription,
      afterOrderStamps:
        progress.currentStamps >= progress.targetOrders
          ? 1
          : progress.currentStamps + 1,
    };
    return card;
  }, [mode, customer, orders, settings]);

  if (!checked) return { card: null, signedIn: false, loading: true };
  if (!customer) return { card: null, signedIn: false, loading: false };
  if (mode === "live") {
    return {
      card: liveCard,
      signedIn: true,
      loading: !liveCard && !liveError,
    };
  }
  return { card: demoCard, signedIn: true, loading: false };
}
