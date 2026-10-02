"use client";

/**
 * Admin → Riders → Incentives (item V, 202610020010): the daily-target bonus
 * and the refer-a-rider bonus. Both are OFF until amounts are set; the cron
 * pays them into the rider's wallet as `incentive` rows.
 */

import Link from "next/link";
import { useState } from "react";
import { INCENTIVE_BOUNDS, anyIncentiveOn } from "@/lib/rider-incentives";
import { useRiderIncentiveSettings, type IncentiveForm } from "@/lib/use-rider-incentive-settings";

const inputCls = "mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line";

export default function RiderIncentivesPage() {
  const { live, checked, settings, loaded, error, save, clearError } = useRiderIncentiveSettings();
  const [draft, setDraft] = useState<IncentiveForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown: IncentiveForm = draft ?? {
    dailyTarget: String(settings.dailyTarget),
    dailyBonusTaka: String(settings.dailyBonus / 100),
    referralBonusTaka: String(settings.referralBonus / 100),
    referralAfter: String(settings.referralAfter),
  };
  const edit = (patch: Partial<IncentiveForm>) => {
    setDraft({ ...shown, ...patch });
    setSaved(false);
    clearError();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    const ok = await save(shown);
    setBusy(false);
    if (ok) {
      setSaved(true);
      setDraft(null);
    }
  };

  const maxTaka = INCENTIVE_BOUNDS.bonusPaisa.max / 100;
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Rider incentives</h1>
          <p className="mt-1 text-sm text-ink-soft">
            রাইডারদের বোনাস — দুটোই ডিফল্টে বন্ধ। অ্যামাউন্ট দিলে প্রতি ১৫ মিনিটে স্বয়ংক্রিয়ভাবে ওয়ালেটে যোগ হয় (একই বোনাস দুবার নয়) এবং Money → Audit-এ লেখা থাকে।
          </p>
        </div>
        <Link href="/admin/riders" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
          ← Riders
        </Link>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>
      )}
      {saved && (
        <p role="status" data-testid="incentives-saved" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          সেভ হয়েছে।
        </p>
      )}

      {live && (
        <form onSubmit={submit} className="space-y-6 rounded-2xl bg-paper p-5 ring-1 ring-line" data-testid="incentives-form">
          <fieldset className="space-y-4">
            <legend className="font-display text-base font-semibold text-forest-900">🎯 Daily target</legend>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Deliveries in one day (0 = off)
              <input
                type="number" inputMode="numeric" min={0} max={INCENTIVE_BOUNDS.dailyTarget.max} step={1}
                value={shown.dailyTarget} onChange={(e) => edit({ dailyTarget: e.target.value })}
                disabled={!loaded} className={inputCls}
              />
              <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
                ঢাকার এক দিনে এতগুলো ডেলিভারি (রিটার্ন ছাড়া) শেষ করলে বোনাস। দিনে একবারই।
              </span>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Bonus (৳)
              <input
                type="number" inputMode="decimal" min={0} max={maxTaka} step={1}
                value={shown.dailyBonusTaka} onChange={(e) => edit({ dailyBonusTaka: e.target.value })}
                disabled={!loaded} className={inputCls}
              />
            </label>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-display text-base font-semibold text-forest-900">🤝 Refer a rider</legend>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Referral bonus (৳, 0 = off)
              <input
                type="number" inputMode="decimal" min={0} max={maxTaka} step={1}
                value={shown.referralBonusTaka} onChange={(e) => edit({ referralBonusTaka: e.target.value })}
                disabled={!loaded} className={inputCls}
              />
              <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
                নতুন রাইডার আবেদনের সময় কোড দিলে, সে নিচের সংখ্যক ডেলিভারি শেষ করার পর যে রাইডার তাকে এনেছে সে এই বোনাস পায় (একজনের জন্য একবার; রেফারার সক্রিয় থাকতে হবে)।
              </span>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              New rider must complete (deliveries)
              <input
                type="number" inputMode="numeric" min={INCENTIVE_BOUNDS.referralAfter.min} max={INCENTIVE_BOUNDS.referralAfter.max} step={1}
                value={shown.referralAfter} onChange={(e) => edit({ referralAfter: e.target.value })}
                disabled={!loaded} className={inputCls}
              />
            </label>
          </fieldset>

          <p className="text-xs text-ink-soft" data-testid="incentives-state">
            এখন: {anyIncentiveOn(settings) ? "চালু আছে" : "সব বন্ধ"}
          </p>
          <button
            type="submit" disabled={busy || !loaded}
            className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
