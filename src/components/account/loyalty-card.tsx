"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOrders } from "@/lib/use-orders";
import { useSettings } from "@/lib/use-settings";
import { calculateLoyaltyProgress } from "@/lib/loyalty";
import { IconCheck, IconGift, IconStar } from "@/components/ui/icons";

interface LoyaltyCardProps {
  email?: string | null;
  phone?: string | null;
  className?: string;
}

export function LoyaltyCard({ email, phone, className = "" }: LoyaltyCardProps) {
  const { orders } = useOrders();
  const { settings } = useSettings();

  const progress = useMemo(() => {
    return calculateLoyaltyProgress(orders, settings, { email, phone });
  }, [orders, settings, email, phone]);

  if (!progress.enabled) {
    return null;
  }

  const {
    targetOrders,
    currentStamps,
    isUnlocked,
    remainingOrders,
    percent,
    rewardTitle,
    rewardDescription,
    totalDelivered,
    completedCycles,
  } = progress;

  // Render stamp slots (1 to targetOrders)
  const slots = Array.from({ length: targetOrders }, (_, i) => i + 1);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-paper p-6 sm:p-8 shadow-sm transition-all ${className}`}
      data-testid="loyalty-stamp-card"
    >
      {/* Subtle decorative background accent */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold-400/10 blur-2xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
            <IconStar className="h-3.5 w-3.5 text-gold-600" /> PROSANTI রিওয়ার্ডস
          </span>
          <h3 className="mt-2 font-display text-xl font-medium text-forest-900 sm:text-2xl">
            {isUnlocked
              ? "🎉 অভিনন্দন! আপনি রিওয়ার্ড অর্জন করেছেন"
              : "১০-অর্ডার লয়্যালটি স্ট্যাম্প কার্ড"}
          </h3>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            {isUnlocked
              ? "আপনার আকর্ষণীয় বিশেষ উপহার পরবর্তী অর্ডারে সক্রিয় করা হয়েছে।"
              : `প্রতিটি সফল ডেলিভারিতে ১টি স্ট্যাম্প সংগ্রহ করুন। ${targetOrders}টি সম্পূর্ণ হলেই বিশেষ উপহার!`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-ivory-100 px-3.5 py-2 ring-1 ring-line">
          <IconGift className="h-5 w-5 text-gold-600" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              বর্তমান পুরস্কার
            </p>
            <p className="text-xs font-bold text-forest-900 line-clamp-1 max-w-[160px]">
              {rewardTitle}
            </p>
          </div>
        </div>
      </div>

      {/* Unlocked Celebration Banner */}
      {isUnlocked && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-gold-300 bg-gradient-to-r from-gold-50 via-ivory-50 to-gold-50 p-4 text-forest-950 sm:p-5"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-forest-950 shadow-sm">
              <IconGift className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-medium text-forest-950">
                {rewardTitle}
              </p>
              {rewardDescription && (
                <p className="mt-1 text-xs leading-relaxed text-ink-soft sm:text-sm">
                  {rewardDescription}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
                >
                  এখনই শপ করুন →
                </Link>
                {completedCycles > 1 && (
                  <span className="text-xs font-medium text-gold-700">
                    🏆 আপনি ইতোমধ্যে {completedCycles} বার এই রিওয়ার্ড জিতেছেন!
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stamp Card Grid */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-medium text-ink-soft mb-3">
          <span>
            প্রগ্রেস: <strong className="text-forest-900">{currentStamps}</strong> / {targetOrders} স্ট্যাম্প
          </span>
          <span>
            {remainingOrders > 0
              ? `আর মাত্র ${remainingOrders}টি অর্ডার বাকি`
              : "সাইকেল সম্পূর্ণ! ✨"}
          </span>
        </div>

        {/* Visual Stamp Slots */}
        <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-3">
          {slots.map((num) => {
            const isFilled = num <= currentStamps;
            const isTargetSlot = num === targetOrders;

            return (
              <div
                key={num}
                className={`group relative flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition-all ${
                  isFilled
                    ? "border border-gold-400 bg-gradient-to-b from-forest-800 to-forest-900 text-gold-200 shadow-sm ring-1 ring-gold-400/40"
                    : isTargetSlot
                    ? "border border-dashed border-gold-400 bg-gold-50/50 text-gold-700 hover:border-gold-500"
                    : "border border-dashed border-line bg-ivory-50 text-ink-soft hover:border-line-strong"
                }`}
                title={
                  isFilled
                    ? `অর্ডার #${num}: সফলভাবে সম্পন্ন ✅`
                    : isTargetSlot
                    ? `টার্গেট #${num}: রিওয়ার্ড আনলক স্লট 🎁`
                    : `স্ট্যাম্প #${num}`
                }
              >
                {/* Stamp Icon / Number */}
                <div className="flex h-7 w-7 items-center justify-center rounded-full">
                  {isFilled ? (
                    <IconCheck className="h-4 w-4 text-gold-300 stroke-[2.5]" />
                  ) : isTargetSlot ? (
                    <IconGift className="h-4 w-4 text-gold-600" />
                  ) : (
                    <span className="font-mono text-xs font-semibold text-ink-soft/70">
                      {num}
                    </span>
                  )}
                </div>

                <span
                  className={`mt-1 text-[10px] font-medium leading-none ${
                    isFilled
                      ? "text-gold-200/90"
                      : isTargetSlot
                      ? "font-semibold text-gold-700"
                      : "text-ink-soft/60"
                  }`}
                >
                  {isTargetSlot ? "রিওয়ার্ড" : `#${num}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line/50"
            role="progressbar"
            aria-valuenow={currentStamps}
            aria-valuemin={0}
            aria-valuemax={targetOrders}
            aria-label="লয়্যালটি স্ট্যাম্প প্রগ্রেস"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-forest-800 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-soft">
            <span>সর্বমোট সফল ডেলিভারি: {totalDelivered} টি</span>
            {progress.minOrderTaka > 0 && (
              <span>(নূন্যতম ৳{progress.minOrderTaka} অর্ডারে প্রযোজ্য)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
