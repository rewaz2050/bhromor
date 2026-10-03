"use client";

/**
 * Admin → Riders → Scorecards (item M, 202610020006): every active rider's
 * 30-day reliability, worst first, with the reason behind each flag — plus the
 * opt-in switch for automatic suspension on hard rules.
 */

import Link from "next/link";
import { useState } from "react";
import { formatBdt } from "@/lib/format";
import { AUTO_SUSPEND, type Grade } from "@/lib/rider-quality";
import { useRiderScorecards } from "@/lib/use-rider-scorecards";

const GRADE_CLS: Record<Grade, string> = {
  A: "bg-emerald-100 text-emerald-900",
  B: "bg-lime-100 text-lime-900",
  C: "bg-amber-100 text-amber-900",
  D: "bg-rose-100 text-rose-900",
  new: "bg-ivory-200 text-ink-soft",
};

const pct = (n: number | null): string => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default function RiderScorecardsPage() {
  const { live, checked, riders, ready, autoSuspend, loaded, error, refresh, setPolicy } = useRiderScorecards();
  const [busy, setBusy] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const shown = onlyFlagged ? riders.filter((r) => r.assessment.flags.length > 0) : riders;
  const atRisk = riders.filter((r) => r.assessment.flags.some((f) => f.code === "auto-suspend")).length;

  const toggle = async () => {
    const next = !autoSuspend;
    if (
      next &&
      !window.confirm(
        "Turn ON automatic suspension?\n\nEvery 15 minutes, a rider who meets a hard rule (cash unsettled 4+ days, 50%+ failed deliveries, or a very low rating) is suspended automatically — never mid-delivery. You can reinstate from Riders → Approve.",
      )
    ) {
      return;
    }
    setBusy(true);
    await setPolicy(next);
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Rider scorecards</h1>
          <p className="mt-1 text-sm text-ink-soft">
            গত ৩০ দিনের পারফরম্যান্স — যাদের দিকে নজর দরকার তারা উপরে। স্কোর = ডেলিভারি সফলতা (৫০) + অফার গ্রহণ (২৫) + রেটিং (২৫), পুরনো COD ক্যাশে কিছু কাটা যায়।
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100"
          >
            Refresh
          </button>
          <Link href="/admin/riders" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
            ← Riders
          </Link>
        </div>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {live && loaded && !ready && (
        <p data-testid="scorecards-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Scorecard এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610020006_rider_scorecards.sql</code> চালান।
        </p>
      )}

      {live && ready && (
        <section data-testid="auto-suspend-card" className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-forest-900">স্বয়ংক্রিয় suspend</h2>
              <p className="mt-1 text-xs text-ink-soft">
                বন্ধ থাকলে কিছুই নিজে থেকে হয় না — শুধু এই বোর্ডে চিহ্ন দেখা যায়। চালু করলে প্রতি ১৫ মিনিটে নিচের কঠিন নিয়ম ভাঙা রাইডার suspend হয় (চলমান ডেলিভারি থাকলে পরে)।
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
                <li>COD ক্যাশ {AUTO_SUSPEND.codOverdueHours / 24}+ দিন জমা হয়নি এবং কোনো জমার দাবিও নেই</li>
                <li>{AUTO_SUSPEND.minAttempts}+ ডেলিভারির মধ্যে {AUTO_SUSPEND.failRate * 100}%+ ব্যর্থ</li>
                <li>{AUTO_SUSPEND.minRatings}+ রেটিং-এ গড় {AUTO_SUSPEND.ratingBelow}-এর নিচে</li>
              </ul>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSuspend}
              aria-label="Automatic suspension"
              disabled={busy}
              onClick={() => void toggle()}
              data-testid="auto-suspend-toggle"
              className={`rounded-full px-5 py-2 text-sm font-semibold ring-1 transition-colors disabled:opacity-50 ${
                autoSuspend ? "bg-rose-700 text-white ring-rose-800" : "bg-paper text-forest-900 ring-line hover:bg-ivory-100"
              }`}
            >
              {autoSuspend ? "চালু — বন্ধ করুন" : "বন্ধ — চালু করুন"}
            </button>
          </div>
          {atRisk > 0 && (
            <p data-testid="at-risk" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 ring-1 ring-rose-200">
              {atRisk} জন রাইডার এখন suspend নিয়ম ছুঁয়েছেন
              {autoSuspend ? " — পরের টিকে suspend হবে।" : " — স্বয়ংক্রিয় বন্ধ, তাই কিছু হবে না; দরকার হলে নিজে ব্যবস্থা নিন।"}
            </p>
          )}
        </section>
      )}

      {live && ready && (
        <>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            শুধু চিহ্নিতদের দেখান
          </label>
          {shown.length === 0 ? (
            <p className="rounded-2xl bg-paper p-5 text-sm text-ink-soft ring-1 ring-line">
              {onlyFlagged ? "কারও কোনো চিহ্ন নেই।" : "এখনো কোনো active রাইডার নেই।"}
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map(({ card, assessment }) => (
                <li key={card.id} data-testid="scorecard-row" data-grade={assessment.grade} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${GRADE_CLS[assessment.grade]}`}>
                      {assessment.grade === "new" ? "নতুন" : `${assessment.grade} · ${assessment.score}`}
                    </span>
                    <Link href={`/admin/riders/${card.id}`} className="font-display text-base font-semibold text-forest-900 underline-offset-2 hover:underline">
                      {card.name}
                    </Link>
                    <span className="text-xs text-ink-soft">
                      {card.vehicle}
                      {card.isOnline ? " · Online" : ""}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <Metric label="ডেলিভারি" value={`${card.delivered}${card.failed ? ` (${card.failed} ব্যর্থ)` : ""}`} />
                    <Metric label="সফলতা" value={pct(assessment.successRate)} />
                    <Metric label="অফার নেয়" value={pct(assessment.acceptRate)} />
                    <Metric label="রেটিং" value={card.ratingCount > 0 ? `${card.ratingAvg.toFixed(1)} (${card.ratingCount})` : "—"} />
                    <Metric label="হাতে ক্যাশ" value={formatBdt(card.cashInHand)} />
                  </dl>
                  {assessment.flags.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {assessment.flags.map((f) => (
                        <li
                          key={f.code}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                            f.level === "high" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200"
                          }`}
                        >
                          {f.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-ivory-100 px-3 py-2">
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{label}</dt>
    <dd className="mt-0.5 text-sm font-semibold text-forest-900">{value}</dd>
  </div>
);
