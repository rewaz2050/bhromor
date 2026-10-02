"use client";

/**
 * Admin → Riders → one rider (202610020002, audit item L): "can I trust this
 * rider with more cash?" — money position, COD risk with reasons, 30-day
 * performance, and the latest ledger / payout / settlement / claim / trip rows.
 * Read-only: every action still lives on the riders board.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBdt } from "@/lib/format";
import type { RiskLevel } from "@/lib/rider-risk";
import { useRiderOverview } from "@/lib/use-rider-overview";

const fmtWhen = (ts: number | null): string =>
  ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const RISK_STYLE: Record<RiskLevel, { label: string; cls: string }> = {
  ok: { label: "ঝুঁকি নেই", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  watch: { label: "নজরে রাখুন", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  high: { label: "উচ্চ ঝুঁকি", cls: "bg-rose-50 text-rose-900 ring-rose-200" },
};

const KIND_LABEL: Record<string, string> = {
  tip: "টিপ", delivery_fee: "ডেলিভারি ফি", cod_handling: "COD হ্যান্ডলিং", incentive: "ইনসেনটিভ",
  payout: "উত্তোলন (হোল্ড)", payout_refund: "উত্তোলন ফেরত", adjustment: "সমন্বয়", cod_netting: "COD সমন্বয় (ক্যাশের সাথে)",
};

const Stat = ({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) => (
  <div className="rounded-2xl bg-paper p-4 ring-1 ring-line" data-testid={testId}>
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
    <p className="mt-1 font-display text-xl text-forest-900">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>}
  </div>
);

const Section = ({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) => (
  <section className="rounded-2xl bg-paper ring-1 ring-line" data-testid={testId}>
    <h2 className="px-5 pt-5 font-display text-lg font-bold text-forest-900">{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

const Empty = ({ text }: { text: string }) => <p className="px-5 pb-5 text-sm text-ink-soft">{text}</p>;

export default function AdminRiderProfilePage() {
  const params = useParams<{ id: string }>();
  const riderId = typeof params?.id === "string" ? params.id : "";
  const { live, checked, overview, assessment, ready, loading, error, refresh } = useRiderOverview(riderId);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">{overview?.rider.name ?? "Rider"}</h1>
          {overview && (
            <p className="mt-1 text-sm text-ink-soft">
              {overview.rider.phone} · {overview.rider.vehicle} · {overview.rider.status}
              {overview.rider.isOnline ? " · Online" : ""} · যোগ দিয়েছেন {fmtWhen(overview.rider.createdAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
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
      {live && !ready && (
        <p data-testid="overview-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Rider profile এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610020002_admin_rider_overview.sql</code> চালান।
        </p>
      )}

      {overview && assessment && (
        <>
          {/* COD risk */}
          <section
            data-testid="risk-box"
            data-level={assessment.level}
            className={`rounded-2xl p-5 ring-1 ${RISK_STYLE[assessment.level].cls}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">COD ঝুঁকি: {RISK_STYLE[assessment.level].label}</h2>
              <span className="text-xs font-semibold">
                হাতে {formatBdt(overview.risk.cashInHand)} / লিমিট {formatBdt(overview.risk.cashLimit)} ({assessment.cashPct}%)
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60">
              <div
                className={`h-full rounded-full ${assessment.level === "high" ? "bg-rose-600" : assessment.level === "watch" ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${Math.min(100, assessment.cashPct)}%` }}
              />
            </div>
            {assessment.reasons.length > 0 ? (
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm" data-testid="risk-reasons">
                {assessment.reasons.map((r) => (
                  <li key={r.text}>{r.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">কোনো সতর্কতা নেই।</p>
            )}
            <p className="mt-3 text-xs">
              শেষ জমা: {fmtWhen(overview.risk.lastSettledAt)} · তারপর {overview.risk.codCountSinceSettle}টি COD ডেলিভারি ({formatBdt(overview.risk.codValueSinceSettle)})
              {overview.risk.pendingClaim && ` · জমার দাবি অপেক্ষায়: ${formatBdt(overview.risk.pendingClaim.amount)} (${overview.risk.pendingClaim.method.toUpperCase()})`}
            </p>
          </section>

          {/* Money */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat testId="stat-cash" label="হাতের ক্যাশ" value={formatBdt(overview.money.cashInHand)} hint="অফিসে জমা দিতে হবে" />
            <Stat testId="stat-wallet" label="ওয়ালেট (পাওনা)" value={formatBdt(overview.money.earningsBalance)} hint={`উত্তোলনের অপেক্ষায় ${formatBdt(overview.money.pendingPayout)}`} />
            <Stat testId="stat-earned" label="মোট আয়" value={formatBdt(overview.money.lifetimeEarned)} hint={`উত্তোলন হয়েছে ${formatBdt(overview.money.paidOut)}`} />
            <Stat testId="stat-handed" label="মোট জমা দিয়েছেন" value={formatBdt(overview.money.handedIn)} hint={`এর মধ্যে ওয়ালেট থেকে সমন্বয় ${formatBdt(overview.money.nettedAgainstCash)}`} />
          </div>

          {/* Performance */}
          <Section title="পারফরম্যান্স (গত ৩০ দিন)" testId="performance">
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["অফার", overview.performance.offered30],
                ["ডেলিভারি", overview.performance.delivered30],
                ["ব্যর্থ", overview.performance.failed30],
                ["নিজে বাতিল", overview.performance.declined30],
                ["উপেক্ষা", overview.performance.expired30],
                ["৭ দিনে ডেলিভারি", overview.performance.delivered7],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-ivory-100 p-3 text-center">
                  <p className="font-display text-xl text-forest-900">{value}</p>
                  <p className="text-[11px] text-ink-soft">{label}</p>
                </div>
              ))}
            </div>
            <p className="px-5 pb-5 text-xs text-ink-soft">
              মোট {overview.rider.totalDeliveries} ডেলিভারি · রেটিং {overview.rider.ratingCount > 0 ? `⭐ ${overview.rider.ratingAvg.toFixed(1)} (${overview.rider.ratingCount})` : "এখনো নেই"}
              {overview.performance.avgDeliveryMinutes ? ` · গড় ${overview.performance.avgDeliveryMinutes} মিনিট` : ""}
            </p>
          </Section>

          {/* Trips */}
          <Section title="সাম্প্রতিক ট্রিপ" testId="trips">
            {overview.trips.length === 0 ? (
              <Empty text="এখনো কোনো ট্রিপ সম্পন্ন হয়নি।" />
            ) : (
              <ul className="divide-y divide-line">
                {overview.trips.map((t) => (
                  <li key={t.id} data-testid="trip-row" data-state={t.state} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-mono text-xs font-bold text-forest-900">{t.orderNo || "—"}{t.isReturn ? " · রিটার্ন" : ""}</p>
                      <p className="text-[11px] text-ink-soft">
                        {t.shop || "—"} → {t.area || "—"} · {fmtWhen(t.at)}
                        {t.failedReason ? ` · কারণ: ${t.failedReason}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${t.state === "failed" ? "text-rose-700" : "text-emerald-800"}`}>{t.state === "failed" ? "ব্যর্থ" : "সম্পন্ন"}</p>
                      <p className="text-[11px] text-ink-soft">{t.payment.toUpperCase()} {formatBdt(t.total)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Settlements and claims */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="টাকা জমা (settlement)" testId="settlements">
              {overview.settlements.length === 0 ? (
                <Empty text="এখনো কোনো জমা নেই।" />
              ) : (
                <ul className="divide-y divide-line">
                  {overview.settlements.map((s) => (
                    <li key={s.id} className="px-5 py-3 text-sm">
                      <p className="font-semibold text-forest-900">{formatBdt(s.amount)} · {s.method.toUpperCase()}</p>
                      <p className="text-[11px] text-ink-soft">
                        {fmtWhen(s.at)}{s.reference ? ` · ${s.reference}` : ""}
                        {s.nettedAmount > 0 ? ` · ওয়ালেট থেকে সমন্বয় ${formatBdt(s.nettedAmount)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="জমার দাবি (claim)" testId="claims">
              {overview.claims.length === 0 ? (
                <Empty text="কোনো দাবি নেই।" />
              ) : (
                <ul className="divide-y divide-line">
                  {overview.claims.map((c) => (
                    <li key={c.id} data-status={c.status} className="px-5 py-3 text-sm">
                      <p className="font-semibold text-forest-900">
                        {formatBdt(c.amount)} · {c.method.toUpperCase()} · {c.status === "pending" ? "অপেক্ষায়" : c.status === "approved" ? "অনুমোদিত" : "বাতিল"}
                      </p>
                      <p className="text-[11px] text-ink-soft">
                        {fmtWhen(c.at)}{c.reference ? ` · ${c.reference}` : ""}{c.note ? ` · নোট: ${c.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Payouts */}
          <Section title="উত্তোলনের অনুরোধ" testId="payouts">
            {overview.payouts.length === 0 ? (
              <Empty text="কোনো উত্তোলন নেই।" />
            ) : (
              <ul className="divide-y divide-line">
                {overview.payouts.map((p) => (
                  <li key={p.id} data-status={p.status} className="px-5 py-3 text-sm">
                    <p className="font-semibold text-forest-900">
                      {formatBdt(p.amount)} · {p.method} {p.account} · {p.status === "pending" ? "অপেক্ষায়" : p.status === "paid" ? "পরিশোধিত" : "বাতিল"}
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      {fmtWhen(p.at)}{p.reference ? ` · TRX ${p.reference}` : ""}{p.note ? ` · নোট: ${p.note}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Journal */}
          <Section title="ওয়ালেট জার্নাল (সর্বশেষ ৩০)" testId="journal">
            {overview.journal.length === 0 ? (
              <Empty text="জার্নালে কোনো এন্ট্রি নেই।" />
            ) : (
              <ul className="divide-y divide-line">
                {overview.journal.map((j) => (
                  <li key={j.id} data-testid="journal-row" className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div>
                      <p className="text-forest-900">{KIND_LABEL[j.kind] ?? j.kind}</p>
                      <p className="text-[11px] text-ink-soft">
                        {j.orderNo ? `অর্ডার ${j.orderNo} · ` : ""}{fmtWhen(j.at)}{j.note ? ` · ${j.note}` : ""}
                      </p>
                    </div>
                    <p className={`font-display text-sm font-bold ${j.amount < 0 ? "text-rose-700" : "text-emerald-800"}`}>
                      {j.amount < 0 ? "−" : "+"}{formatBdt(Math.abs(j.amount))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
