"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getOrders,
  subscribeOrders,
} from "@/lib/order-store";
import {
  LAUNCH_FREE_DELIVERY_LIMIT,
  FREE_DELIVERY_MIN_SUBTOTAL_PAISA,
} from "@/lib/delivery";
import { IconGift } from "@/components/ui/icons";

interface PromoInfo {
  totalOrders: number;
  limit: number;
  remaining: number;
  enabled: boolean;
}

/**
 * LAUNCH OFFER banner — "প্রথম 1000 অর্ডারে ডেলিভারি ফ্রি!" with the live
 * X/1000 claimed counter. Live mode reads /api/promo; demo mode counts the
 * browser-local orders. Hidden once the offer is exhausted.
 */
export default function LaunchOfferBanner({ className = "" }: { className?: string }) {
  const [live, setLive] = useState<PromoInfo | null>(null);
  const demoCount = useSyncExternalStore(
    subscribeOrders,
    () => getOrders().length,
    () => 0,
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/promo", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { demoMode?: boolean; totalOrders?: number; limit?: number; remaining?: number; enabled?: boolean }) => {
        if (cancelled || data.demoMode) return;
        const limit = data.limit ?? LAUNCH_FREE_DELIVERY_LIMIT;
        const total = data.totalOrders ?? 0;
        setLive({
          totalOrders: total,
          limit,
          remaining: data.remaining ?? Math.max(0, limit - total),
          enabled: data.enabled ?? total < limit,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isDemo = live === null;
  const total = isDemo ? demoCount : live.totalOrders;
  const limit = live?.limit ?? LAUNCH_FREE_DELIVERY_LIMIT;
  const remaining = Math.max(0, limit - total);
  if (!isDemo && live && !live.enabled) return null; // offer over
  const percent = Math.min(100, Math.round((total / limit) * 100));

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-forest-800 via-forest-700 to-forest-800 p-5 text-ivory-50 shadow-sm sm:p-6 ${className}`}
      data-testid="launch-offer-banner"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold-400/20 blur-2xl"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-lg font-semibold sm:text-xl">
            <IconGift className="h-5 w-5 shrink-0 text-gold-300" />
            প্রথম {limit} অর্ডারে ডেলিভারি ফ্রি!
          </p>
          <p className="mt-1 text-sm text-gold-200">
            আর <strong className="text-gold-300">{remaining}</strong> টা বাকি — এখন অর্ডার করলে ফ্রি পাবেন!
          </p>
        </div>
        <div className="text-right">
          <p
            className="font-mono text-2xl font-bold text-gold-300"
            data-testid="launch-offer-counter"
          >
            {total}/{limit}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-ivory-50/70">
            claimed
          </p>
        </div>
      </div>

      {/* progress bar */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-forest-900/60"
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${limit} অর্ডারের লঞ্চ অফার প্রগ্রেস`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ivory-50/85">
        <span>Zone A ৳30 · Zone B ৳50 · Zone C ৳70 · বাইরে ৳100</span>
        <span className="font-semibold text-gold-200">
          ৳{FREE_DELIVERY_MIN_SUBTOTAL_PAISA / 100}+ অর্ডারে সবসময় ফ্রি
        </span>
      </div>
    </div>
  );
}
