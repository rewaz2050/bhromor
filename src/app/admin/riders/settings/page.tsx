"use client";

/**
 * Admin → Riders → Dispatch rules (J, 202610020003): the three numbers that
 * shape every delivery. Saved into site_settings, read by the dispatch SQL.
 */

import Link from "next/link";
import { useState } from "react";
import { useDispatchSettings } from "@/lib/use-dispatch-settings";
import {
  DISPATCH_BOUNDS,
  DISPATCH_DEFAULTS,
  type DispatchSettings,
} from "@/lib/dispatch-settings";

const inputCls = "mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line";

export default function DispatchRulesPage() {
  const { live, checked, settings, loaded, error, save, clearError } = useDispatchSettings();
  // Edits are kept as text; `null` = untouched, show the saved value.
  const [draft, setDraft] = useState<{ cashTaka: string; offerTtl: string; maxAttempts: string; loadLimit: string; failedTaka: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = draft ?? {
    cashTaka: String(settings.cashCap / 100),
    offerTtl: String(settings.offerTtl),
    maxAttempts: String(settings.maxAttempts),
    loadLimit: String(settings.loadLimit),
    failedTaka: String(settings.failedFee / 100),
  };
  const edit = (patch: Partial<typeof shown>) => {
    setDraft({ ...shown, ...patch });
    setSaved(false);
    clearError();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    const next: DispatchSettings = {
      // Whole paisa; a non-number stays NaN so the server names the field.
      cashCap: Math.round(Number(shown.cashTaka) * 100),
      offerTtl: Number(shown.offerTtl),
      maxAttempts: Number(shown.maxAttempts),
      loadLimit: Number(shown.loadLimit),
      failedFee: Math.round(Number(shown.failedTaka) * 100),
    };
    const ok = await save(next);
    setBusy(false);
    if (ok) {
      setSaved(true);
      setDraft(null);
    }
  };

  const b = DISPATCH_BOUNDS;
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Dispatch rules</h1>
          <p className="mt-1 text-sm text-ink-soft">
            ডেলিভারির তিনটি নিয়ম এখান থেকে বদলান — কোড বা SQL ছুঁতে হবে না। বদলানো সঙ্গে সঙ্গে কার্যকর হয়, আর Money → Audit-এ লেখা থাকে।
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
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" data-testid="dispatch-saved" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          সেভ হয়েছে — নতুন নিয়ম এখন থেকে প্রযোজ্য।
        </p>
      )}

      {live && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-paper p-5 ring-1 ring-line" data-testid="dispatch-form">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Rider cash limit (৳)
            <input
              type="number"
              inputMode="numeric"
              min={b.cashCap.min / 100}
              max={b.cashCap.max / 100}
              step={1}
              value={shown.cashTaka}
              onChange={(e) => edit({ cashTaka: e.target.value })}
              disabled={!loaded}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
              হাতে এই পরিমাণ COD ক্যাশ জমলে রাইডার আর নতুন অফার পান না, যতক্ষণ না জমা দেন। সীমা ৳{b.cashCap.min / 100}–৳{b.cashCap.max / 100}; আগের মান ৳{DISPATCH_DEFAULTS.cashCap / 100}।
            </span>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Offer window (seconds)
            <input
              type="number"
              inputMode="numeric"
              min={b.offerTtl.min}
              max={b.offerTtl.max}
              step={1}
              value={shown.offerTtl}
              onChange={(e) => edit({ offerTtl: e.target.value })}
              disabled={!loaded}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
              একটি অফার কত সেকেন্ড খোলা থাকে; পরে অন্যদের কাছে যায়। {b.offerTtl.min}–{b.offerTtl.max} সেকেন্ড; আগের মান {DISPATCH_DEFAULTS.offerTtl}। শুধু নতুন অফারে প্রযোজ্য।
            </span>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Max delivery attempts
            <input
              type="number"
              inputMode="numeric"
              min={b.maxAttempts.min}
              max={b.maxAttempts.max}
              step={1}
              value={shown.maxAttempts}
              onChange={(e) => edit({ maxAttempts: e.target.value })}
              disabled={!loaded}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
              ডেলিভারি ফেল হলে কতবার চেষ্টা করা যাবে; শেষ চেষ্টার পর অর্ডারটি staff-এর সিদ্ধান্তের জন্য থামে। {b.maxAttempts.min}–{b.maxAttempts.max}; আগের মান {DISPATCH_DEFAULTS.maxAttempts}।
            </span>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Active jobs per rider
            <input
              type="number"
              inputMode="numeric"
              min={b.loadLimit.min}
              max={b.loadLimit.max}
              step={1}
              value={shown.loadLimit}
              onChange={(e) => edit({ loadLimit: e.target.value })}
              disabled={!loaded}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
              একজন রাইডার একসাথে সর্বোচ্চ কয়টি চলমান অর্ডার নিতে পারবেন; এর বেশি হলে নতুন অফার পান না। {b.loadLimit.min}–{b.loadLimit.max}; আগের মান {DISPATCH_DEFAULTS.loadLimit}। migration <code>202610020011</code> লাগে।
            </span>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Failed-delivery fee (৳)
            <input
              type="number"
              inputMode="decimal"
              min={b.failedFee.min / 100}
              max={b.failedFee.max / 100}
              step={1}
              value={shown.failedTaka}
              onChange={(e) => edit({ failedTaka: e.target.value })}
              disabled={!loaded}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
              রাইডার কাস্টমার পর্যন্ত গিয়েও ডেলিভারি করতে না পারলে staff ব্যর্থ-ডেলিভারি নিষ্পত্তির সময় এই ফি দিতে পারেন (প্রতি অর্ডারে একবার, রাইডার নিজে নিতে পারেন না)। ০ = বন্ধ। সর্বোচ্চ ৳{b.failedFee.max / 100}। migration <code>202610020012</code> লাগে।
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !loaded}
              className="rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save rules"}
            </button>
            <button
              type="button"
              onClick={() =>
                edit({
                  cashTaka: String(DISPATCH_DEFAULTS.cashCap / 100),
                  offerTtl: String(DISPATCH_DEFAULTS.offerTtl),
                  maxAttempts: String(DISPATCH_DEFAULTS.maxAttempts),
                  loadLimit: String(DISPATCH_DEFAULTS.loadLimit),
                  failedTaka: String(DISPATCH_DEFAULTS.failedFee / 100),
                })
              }
              className="text-sm font-semibold text-forest-800 underline underline-offset-2"
            >
              আগের মানে ফেরান
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-ink-soft">
        নতুন মান কাজ করতে একবার <code>supabase/migrations/202610020003_dispatch_settings.sql</code> Supabase SQL Editor-এ চালাতে হবে; তার আগে অ্যাপ আগের মান (৳5,000 / 90s / ২ চেষ্টা / ২ সক্রিয় কাজ) ব্যবহার করে।
      </p>
    </div>
  );
}
