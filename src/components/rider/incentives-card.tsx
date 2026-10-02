"use client";

import { useState } from "react";
import { formatBdt } from "@/lib/format";
import { anyIncentiveOn, referralBonusOn, referralShareText, type RiderIncentiveView } from "@/lib/rider-incentives";

/**
 * Bonuses on the earnings page (item V): today's progress toward the daily
 * target, and the rider's own referral code to share. Renders nothing while
 * staff have both bonuses switched off — a rider is never shown a promise the
 * shop is not making.
 */
export default function IncentivesCard({ view }: { view: RiderIncentiveView | null }) {
  const [copied, setCopied] = useState(false);
  if (!view || !anyIncentiveOn(view.settings)) return null;
  const { today, todayPaid, referral, settings } = view;
  const showReferral = referralBonusOn(settings) && referral.code !== "";

  const share = async () => {
    const text = referralShareText(referral.code, referral.bonus, referral.after);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* cancelled or blocked — nothing to report */
    }
  };

  return (
    <section aria-label="Bonuses" data-testid="incentives-card" className="space-y-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
      <h2 className="font-display text-base font-semibold text-forest-900">🎁 বোনাস</h2>

      {today && (
        <div data-testid="daily-progress">
          <p className="text-sm text-forest-900">
            আজ {settings.dailyTarget}টি ডেলিভারি করলে <strong>{formatBdt(settings.dailyBonus)}</strong> বোনাস
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line/60" role="progressbar" aria-valuemin={0} aria-valuemax={today.target} aria-valuenow={today.done}>
            <div className={`h-full rounded-full ${today.reached ? "bg-emerald-500" : "bg-gold-400"}`} style={{ width: `${today.percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-soft" data-testid="daily-status">
            {today.reached
              ? todayPaid
                ? `🎉 টার্গেট পূর্ণ — ${formatBdt(settings.dailyBonus)} ওয়ালেটে যোগ হয়েছে`
                : "🎉 টার্গেট পূর্ণ — বোনাস কিছুক্ষণের মধ্যেই ওয়ালেটে যোগ হবে"
              : `${today.done}/${today.target} শেষ — আর ${today.left}টি বাকি`}
          </p>
        </div>
      )}

      {showReferral && (
        <div data-testid="referral">
          <p className="text-sm text-forest-900">
            বন্ধুকে রাইডার বানান — সে {referral.after}টি ডেলিভারি শেষ করলে আপনি পাবেন <strong>{formatBdt(referral.bonus)}</strong>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code data-testid="referral-code" className="rounded-xl bg-ivory-100 px-3 py-1.5 font-mono text-base font-bold tracking-widest text-forest-900 ring-1 ring-line">
              {referral.code}
            </code>
            <button type="button" onClick={() => void share()} className="rounded-xl bg-forest-800 px-3 py-1.5 text-xs font-semibold text-white">
              {copied ? "কপি হয়েছে ✓" : "শেয়ার করুন"}
            </button>
          </div>
          {referral.items.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink" data-testid="referral-list">
              {referral.items.map((r, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{r.name}</span>
                  <span className={r.rewarded ? "font-semibold text-emerald-700" : "text-ink-soft"}>
                    {r.rewarded ? "বোনাস পেয়েছেন ✓" : `${Math.min(r.done, referral.after)}/${referral.after} ডেলিভারি`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {referral.totalEarned > 0 && (
            <p className="mt-2 text-xs text-ink-soft">এ পর্যন্ত রেফারেল বোনাস: {formatBdt(referral.totalEarned)}</p>
          )}
        </div>
      )}
    </section>
  );
}
