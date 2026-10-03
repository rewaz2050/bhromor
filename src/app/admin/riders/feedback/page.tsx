"use client";

/**
 * Admin → Riders → Customer feedback (item X, 202610020009): what customers
 * said about each delivery — stars, quick reasons and words — worst first.
 * Staff can keep an unfair comment from the rider ("Hide from rider").
 */

import Link from "next/link";
import { useState } from "react";
import { feedbackSummary } from "@/lib/delivery-feedback";
import { useRiderFeedback, type FeedbackFilter } from "@/lib/use-rider-feedback";

const FILTERS: { id: FeedbackFilter; label: string }[] = [
  { id: "low", label: "1–2 stars" },
  { id: "words", label: "With words" },
  { id: "all", label: "All ratings" },
];

const fmtWhen = (ts: number): string =>
  ts > 0 ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function RiderFeedbackPage() {
  const { live, checked, filter, setFilter, items, ready, loaded, error, setHidden } = useRiderFeedback();
  const [actionError, setActionError] = useState<string | null>(null);

  const toggle = async (orderId: string, hidden: boolean) => {
    setActionError(await setHidden(orderId, hidden));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Customer feedback</h1>
          <p className="mt-1 text-sm text-ink-soft">
            ডেলিভারি নিয়ে কাস্টমার কী বলেছেন — খারাপ রেটিং আগে। অন্যায্য মন্তব্য রাইডারের কাছ থেকে লুকানো যায়।
          </p>
        </div>
        <Link href="/admin/riders" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
          ← Riders
        </Link>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}
      {(error || actionError) && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error ?? actionError}</p>
      )}
      {loaded && !ready && (
        <p data-testid="feedback-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Feedback is not set up yet. Run <code>supabase/migrations/202610020009_delivery_feedback.sql</code> in the Supabase SQL Editor.
        </p>
      )}

      <div role="tablist" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              filter === f.id ? "bg-forest-800 text-white ring-forest-800" : "bg-white text-forest-900 ring-line"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loaded && ready && items.length === 0 && <p className="text-sm text-ink-soft">No feedback here yet.</p>}

      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.orderId} data-testid="feedback-row" className="rounded-2xl bg-paper p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-forest-900">
                <span className={r.stars <= 2 ? "text-rose-700" : "text-gold-600"}>{"★".repeat(r.stars)}</span>{" "}
                {r.riderName || "Rider"} <span className="font-normal text-ink-soft">· #{r.orderNo || "—"}</span>
              </p>
              <p className="text-[11px] text-ink-soft">{fmtWhen(r.at)}</p>
            </div>
            {r.hasFeedback ? (
              <p className="mt-1 text-sm text-ink">{feedbackSummary(r) || "—"}</p>
            ) : (
              <p className="mt-1 text-xs text-ink-soft">Stars only — no reason given.</p>
            )}
            {r.hasFeedback && r.comment && (
              <button
                onClick={() => void toggle(r.orderId, !r.hidden)}
                className="mt-2 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-line"
              >
                {r.hidden ? "Hidden from rider — show again" : "Hide from rider"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
