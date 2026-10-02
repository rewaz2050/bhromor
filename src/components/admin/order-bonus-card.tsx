"use client";

/**
 * Peak-hour and rainy-day per-order bonus (202610020015) — a card under the
 * Incentives form. Both amounts are OFF (0) until staff set them; the cron pays them.
 */
import { useState } from "react";
import { ORDER_BONUS_BOUNDS, anyOrderBonusOn, peakWindowLabel } from "@/lib/rider-order-bonus";
import { useRiderOrderBonus, type OrderBonusForm } from "@/lib/use-rider-order-bonus";

const inputCls = "mt-1 w-full rounded-xl bg-ivory-100 px-3 py-2 text-sm normal-case text-ink ring-1 ring-line";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-ink-soft";

export default function OrderBonusCard() {
  const { live, settings, loaded, error, save, clearError } = useRiderOrderBonus();
  const [draft, setDraft] = useState<OrderBonusForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!live) return null;

  const shown: OrderBonusForm = draft ?? {
    peakBonusTaka: String(settings.peakBonus / 100),
    peakStartHour: String(settings.peakStartHour),
    peakEndHour: String(settings.peakEndHour),
    rainBonusTaka: String(settings.rainBonus / 100),
    streakWeeks: String(settings.streakWeeks),
    streakBonusTaka: String(settings.streakBonus / 100),
  };
  const edit = (patch: Partial<OrderBonusForm>) => {
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
  const maxTaka = ORDER_BONUS_BOUNDS.bonusPaisa.max / 100;

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl bg-paper p-5 ring-1 ring-line" data-testid="order-bonus-form">
      <div>
        <h2 className="font-display text-base font-semibold text-forest-900">⚡ Peak-hour, 🌧️ rainy-day (per order) &amp; 🔥 streak bonus</h2>
        <p className="mt-1 text-[11px] text-ink-soft">
          প্রতিটি ডেলিভারির (রিটার্ন ছাড়া) জন্য নির্দিষ্ট বোনাস — পিক সময়ে ডেলিভারি হলে, অথবা কাস্টমার বৃষ্টির সারচার্জ দিয়ে থাকলে। দুটোই একসাথে পেতে পারে; প্রতিটি অর্ডারে প্রতি ধরনে একবার। ০ = বন্ধ।
        </p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
      {saved && <p role="status" data-testid="order-bonus-saved" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">সেভ হয়েছে।</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelCls}>
          Peak bonus per order (৳)
          <input type="number" inputMode="decimal" min={0} max={maxTaka} step={1} value={shown.peakBonusTaka}
            onChange={(e) => edit({ peakBonusTaka: e.target.value })} disabled={!loaded} className={inputCls} />
        </label>
        <label className={labelCls}>
          Peak starts (Dhaka hour, 0–23)
          <input type="number" inputMode="numeric" min={0} max={23} step={1} value={shown.peakStartHour}
            onChange={(e) => edit({ peakStartHour: e.target.value })} disabled={!loaded} className={inputCls} />
        </label>
        <label className={labelCls}>
          Peak ends (exclusive)
          <input type="number" inputMode="numeric" min={0} max={23} step={1} value={shown.peakEndHour}
            onChange={(e) => edit({ peakEndHour: e.target.value })} disabled={!loaded} className={inputCls} />
        </label>
      </div>
      <p className="text-[11px] text-ink-soft">
        ডেলিভারির সময় ঢাকার ঘড়িতে {peakWindowLabel({ peakStartHour: Number(shown.peakStartHour) || 0, peakEndHour: Number(shown.peakEndHour) || 0 })}-এর মধ্যে হলে। রাত পেরোনো সময়ের জন্য শুরু &gt; শেষ দিন (যেমন ২২ → ২)।
      </p>
      <label className={labelCls}>
        Rainy-day bonus per order (৳)
        <input type="number" inputMode="decimal" min={0} max={maxTaka} step={1} value={shown.rainBonusTaka}
          onChange={(e) => edit({ rainBonusTaka: e.target.value })} disabled={!loaded} className={inputCls} />
        <span className="mt-1 block text-[11px] font-normal normal-case text-ink-soft">
          শুধু সেই অর্ডার যেখানে কাস্টমার বৃষ্টির সারচার্জ দিয়েছে (Settings-এ rain surcharge চালু থাকতে হবে)।
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          🔥 Streak — weeks in a row (0 = off, 2–8)
          <input type="number" inputMode="numeric" min={0} max={ORDER_BONUS_BOUNDS.streakWeeks.max} step={1} value={shown.streakWeeks}
            onChange={(e) => edit({ streakWeeks: e.target.value })} disabled={!loaded} className={inputCls} />
        </label>
        <label className={labelCls}>
          Streak bonus (৳)
          <input type="number" inputMode="decimal" min={0} max={ORDER_BONUS_BOUNDS.streakBonusPaisa.max / 100} step={1} value={shown.streakBonusTaka}
            onChange={(e) => edit({ streakBonusTaka: e.target.value })} disabled={!loaded} className={inputCls} />
        </label>
      </div>
      <p className="text-[11px] text-ink-soft">
        রাইডার পরপর এতগুলো সম্পূর্ণ সপ্তাহ (সোম–রবি, ঢাকা) <strong>Weekly tier 1 target</strong> ছুঁলে একবার এই বোনাস পায়; তারপর স্ট্রিক নতুন করে শুরু। উপরের Incentives ফর্মে Weekly tier 1 target সেট না থাকলে কিছুই দেওয়া হয় না।
      </p>
      <p className="text-xs text-ink-soft" data-testid="order-bonus-state">
        এখন: {anyOrderBonusOn(settings) ? "চালু আছে" : "সব বন্ধ"}
      </p>
      <button type="submit" disabled={busy || !loaded} className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
