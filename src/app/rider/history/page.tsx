"use client";

/**
 * /rider/history — every finished trip, grouped by day, with what each one
 * earned and the COD cash it put in the rider's hands. The home screen shows
 * only live jobs; this is the record.
 */

import { useMemo, useState } from "react";
import { useRiderSession } from "@/lib/use-rider";
import { useRiderHistory } from "@/lib/use-rider-history";
import { groupHistoryByDay, historyDayLabel } from "@/lib/rider-history";
import { formatBdt } from "@/lib/format";
import { useRiderDisputes } from "@/lib/use-rider-disputes";
import { DisputeForm } from "@/components/rider/dispute-form";
import { disputeCategoryLabel, type DisputeStatus } from "@/lib/rider-disputes";

const STATUS_LABEL: Record<DisputeStatus, { text: string; cls: string }> = {
  pending: { text: "অপেক্ষায়", cls: "bg-amber-100 text-amber-900" },
  approved: { text: "গৃহীত", cls: "bg-emerald-100 text-emerald-900" },
  rejected: { text: "গ্রহণ হয়নি", cls: "bg-rose-100 text-rose-900" },
};

export default function RiderHistoryPage() {
  const session = useRiderSession();
  const history = useRiderHistory(session.status === "authed");
  const days = useMemo(() => groupHistoryByDay(history.items), [history.items]);
  const disputes = useRiderDisputes(session.status === "authed");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="flex-1 pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-forest-900 px-5 py-4 text-ivory-50">
        <h1 className="font-display text-base font-semibold">ট্রিপের ইতিহাস</h1>
        <p className="text-[11px] text-ivory-100/70">সম্পন্ন ও ব্যর্থ সব ডেলিভারি</p>
      </header>

      <div className="space-y-5 p-4">
        {history.error && (
          <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-900 ring-1 ring-rose-300">
            {history.error}
          </p>
        )}

        {sent && (
          <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-300">
            অভিযোগ জমা হয়েছে — অফিস দেখে উত্তর দেবে (ইনবক্সে জানানো হবে)।
          </p>
        )}

        {disputes.items.length > 0 && (
          <section aria-label="আমার অভিযোগ" data-testid="my-disputes">
            <h2 className="font-display mb-2 text-sm font-semibold text-forest-900">আমার অভিযোগ</h2>
            <ul className="space-y-2">
              {disputes.items.slice(0, 5).map((d) => (
                <li key={d.id} data-testid="dispute-item" data-status={d.status} className="rounded-2xl border border-line bg-paper p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-forest-900">
                      {disputeCategoryLabel(d.category)}
                      {d.orderNo ? <span className="ml-1 font-mono text-[11px] text-ink-soft">#{d.orderNo}</span> : null}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_LABEL[d.status].cls}`}>{STATUS_LABEL[d.status].text}</span>
                  </div>
                  <p className="mt-1 text-ink-soft">{d.message}</p>
                  {d.status !== "pending" && d.note && <p className="mt-1 font-semibold text-forest-900">অফিস: {d.note}</p>}
                  {d.status === "approved" && d.adjustmentAmount !== 0 && (
                    <p className="mt-1 font-bold text-emerald-700">
                      ওয়ালেট {d.adjustmentAmount > 0 ? "+" : "−"}{formatBdt(Math.abs(d.adjustmentAmount))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!history.loading && !history.error && days.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-ivory-100/50 p-8 text-center" data-testid="history-empty">
            <p className="text-sm font-semibold text-forest-900">এখনো কোনো ট্রিপ সম্পন্ন হয়নি</p>
            <p className="mt-1 text-xs text-ink-soft">প্রথম ডেলিভারি শেষ হলে এখানে হিসাবসহ দেখা যাবে।</p>
          </div>
        )}

        {days.map((day) => (
          <section key={day.day} aria-label={day.day} data-testid="history-day">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-sm font-semibold text-forest-900">{historyDayLabel(day.day)}</h2>
              <p className="text-[11px] text-ink-soft" data-testid="history-day-total">
                {day.delivered} ডেলিভারি{day.failed > 0 ? ` · ${day.failed} ব্যর্থ` : ""}
                {day.earned > 0 ? ` · আয় ${formatBdt(day.earned)}` : ""}
              </p>
            </div>
            <ul className="space-y-2">
              {day.items.map((it) => (
                <li
                  key={it.id}
                  data-testid="history-item"
                  data-outcome={it.outcome}
                  className={`rounded-2xl border p-3.5 ${it.outcome === "failed" ? "border-rose-200 bg-rose-50/60" : "border-line bg-paper"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-forest-900">
                        #{it.orderNo}
                        {it.isReturn && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px font-sans text-[9px] text-amber-900">রিটার্ন</span>}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-soft">
                        {[it.shopName, it.area].filter(Boolean).join(" → ")}
                      </p>
                      {it.outcome === "failed" && it.failedReason && (
                        <p className="mt-1 text-[11px] text-rose-800">কারণ: {it.failedReason}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {it.outcome === "delivered" ? (
                        <p className="text-sm font-bold text-emerald-700">{it.earned > 0 ? `+${formatBdt(it.earned)}` : "✓"}</p>
                      ) : (
                        <p className="text-xs font-bold text-rose-700">ব্যর্থ</p>
                      )}
                      <p className="text-[10px] text-ink-soft">
                        {new Date(it.at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  {it.cash > 0 && (
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-800">💵 ক্যাশ নিয়েছেন {formatBdt(it.cash)}</p>
                  )}
                  {it.outcome === "delivered" && it.payment !== "cod" && !it.isReturn && (
                    <p className="mt-1.5 text-[11px] text-ink-soft">{it.payment === "bkash" ? "bKash" : "Nagad"} — আগেই পরিশোধিত</p>
                  )}
                  {disputes.ready && reportFor !== it.id && (
                    <button
                      type="button"
                      data-testid="dispute-open"
                      onClick={() => {
                        setReportFor(it.id);
                        setSent(false);
                      }}
                      className="mt-2 text-[11px] font-semibold text-forest-800 underline underline-offset-2"
                    >
                      সমস্যা জানান
                    </button>
                  )}
                  {reportFor === it.id && (
                    <DisputeForm
                      orderNo={it.orderNo}
                      onCancel={() => setReportFor(null)}
                      onSubmit={async (form) => {
                        const err = await disputes.raise({ ...form, assignmentId: it.id });
                        if (!err) {
                          setReportFor(null);
                          setSent(true);
                        }
                        return err;
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {history.hasMore && (
          <button
            type="button"
            data-testid="history-more"
            disabled={history.loading}
            onClick={() => void history.loadMore()}
            className="w-full rounded-full border border-line bg-paper py-2.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100 disabled:opacity-50"
          >
            {history.loading ? "লোড হচ্ছে…" : "আরও দেখুন"}
          </button>
        )}
        {history.loading && days.length === 0 && (
          <div className="space-y-2" aria-label="Loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-line/60" />)}
          </div>
        )}
      </div>
    </div>
  );
}
