"use client";

/**
 * Admin → Money → Daily reconciliation (202610010007, audit item U): what
 * moved on one Dhaka day, where the money stands now, and the checks that must
 * all be clean before the day is closed. Printable; copyable as plain text.
 */

import { useState } from "react";
import Link from "next/link";
import { formatBdt } from "@/lib/format";
import {
  DAILY_CHECK_LABEL,
  dailyToText,
  parseDay,
  shiftDay,
  todayDhaka,
} from "@/lib/money-daily";
import { useMoneyDaily } from "@/lib/use-money-daily";

const Row = ({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) => (
  <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm" data-testid={testId}>
    <div>
      <p className="text-forest-900">{label}</p>
      {hint && <p className="text-[11px] text-ink-soft">{hint}</p>}
    </div>
    <p className="font-semibold tabular-nums text-forest-900">{value}</p>
  </div>
);

export default function MoneyDailyPage() {
  const { live, checked, day, setDay, report, ready, loading, error, refresh } = useMoneyDaily();
  const [copied, setCopied] = useState(false);
  const today = todayDhaka();

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(dailyToText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const failed = report?.checks.filter((c) => !c.ok) ?? [];
  const f = report?.flows;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Daily reconciliation</h1>
          <p className="mt-1 text-sm text-ink-soft">দিনের হিসাব মেলানো — কত টাকা এল, কত গেল, আর কোথাও গড়বড় আছে কিনা।</p>
        </div>
        <Link href="/admin/money" className="text-sm font-semibold text-forest-800 underline underline-offset-2 print:hidden">
          ← Money
        </Link>
      </header>

      {checked && !live && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Staff হিসেবে sign in করুন।</p>
      )}

      {live && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            data-testid="day-prev"
            onClick={() => setDay(shiftDay(day, -1))}
            className="rounded-full bg-paper px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ivory-100"
            aria-label="Previous day"
          >
            ←
          </button>
          <input
            type="date"
            data-testid="day-input"
            value={day}
            max={today}
            onChange={(e) => setDay(parseDay(e.target.value))}
            className="rounded-xl bg-paper px-3 py-1.5 text-sm ring-1 ring-line"
          />
          <button
            type="button"
            data-testid="day-next"
            disabled={day >= today}
            onClick={() => setDay(shiftDay(day, 1))}
            className="rounded-full bg-paper px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ivory-100 disabled:opacity-40"
            aria-label="Next day"
          >
            →
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100 disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" data-testid="copy-summary" onClick={() => void copy()} disabled={!report} className="rounded-full bg-forest-800 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50">
            {copied ? "Copied ✓" : "Copy summary"}
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100">
            Print
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {live && !ready && (
        <p data-testid="daily-missing" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Daily report এখনো চালু হয়নি। Supabase SQL Editor-এ <code>supabase/migrations/202610010007_money_daily.sql</code> চালান।
        </p>
      )}

      {report && f && (
        <>
          <section
            data-testid="daily-verdict"
            className={`rounded-2xl p-4 ring-1 ${failed.length === 0 ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}
          >
            <p className="text-sm font-bold">
              {failed.length === 0 ? "✅ সব check পরিষ্কার — দিনের হিসাব মিলেছে" : `⚠️ ${failed.length}টি বিষয় দেখা দরকার`}
            </p>
            <p className="mt-0.5 text-xs">{report.day} (Dhaka)</p>
          </section>

          <section aria-label="Checks" className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
            <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Checks</h2>
            <ul className="divide-y divide-line">
              {report.checks.map((c) => (
                <li key={c.key} className="px-4 py-2.5 text-sm" data-testid={`check-${c.key}`} data-ok={c.ok ? "yes" : "no"}>
                  <p className={c.ok ? "text-forest-900" : "font-semibold text-rose-800"}>
                    {c.ok ? "✅" : "⚠️"} {DAILY_CHECK_LABEL[c.key].title}
                    {!c.ok && <span className="ml-2 text-xs font-normal">({c.count})</span>}
                  </p>
                  {!c.ok && (
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {DAILY_CHECK_LABEL[c.key].fix}
                      {c.sample.length > 0 && <span className="ml-1 font-mono">{c.sample.map((s) => s.slice(0, 8)).join(", ")}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Day flows" className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
            <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">What moved on {report.day}</h2>
            <div className="divide-y divide-line">
              <Row label="Delivered orders" value={String(f.deliveredOrders)} hint={f.returnLegs ? `+ ${f.returnLegs} return legs` : undefined} testId="flow-orders" />
              <Row label="Order value" value={formatBdt(f.orderValue)} />
              <Row label="COD collected by riders" value={formatBdt(f.codCollectedByRiders)} hint="Cash now in riders' hands" testId="flow-cod" />
              <Row
                label="Paid by bKash / Nagad"
                value={formatBdt(f.walletPaidOrders)}
                hint={f.shopWalletOrders > 0 ? `${formatBdt(f.shopWalletOrders)} went to shops' own wallets` : undefined}
                testId="flow-wallet"
              />
              <Row
                label="Riders handed in"
                value={formatBdt(f.cashHandedIn)}
                hint={`${f.settlementsCount} settlement(s)${f.settlementsNetted > 0 ? ` · plus ${formatBdt(f.settlementsNetted)} netted from wallets` : ""}`}
                testId="flow-handed-in"
              />
              <Row label="Commission earned" value={formatBdt(f.commission)} />
              <Row label="Delivery income" value={formatBdt(f.deliveryIncome)} />
              <Row label="Owed to shops (new)" value={formatBdt(f.shopPayableAccrued)} />
              <Row label="Shop payouts paid" value={formatBdt(f.shopPayoutsPaid)} />
              {f.shopRemittances > 0 && <Row label="Shops remitted to PROSANTI" value={formatBdt(f.shopRemittances)} testId="flow-remitted" />}
              <Row label="Rider earned" value={formatBdt(f.riderEarned)} hint={f.riderAdjustments ? `adjustments ${f.riderAdjustments < 0 ? "−" : ""}${formatBdt(Math.abs(f.riderAdjustments))}` : undefined} />
              <Row label="Rider payouts requested" value={formatBdt(f.riderPayoutsRequested)} />
              <Row label="Rider payouts paid" value={formatBdt(f.riderPayoutsPaid)} />
            </div>
          </section>

          <section aria-label="Position now" className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
            <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Where the money stands right now</h2>
            <div className="divide-y divide-line">
              <Row label="Cash riders are holding" value={formatBdt(report.position.codCustody)} testId="pos-custody" />
              <Row label="Owed to riders (wallets)" value={formatBdt(report.position.riderPayable)} />
              <Row label="Owed to shops" value={formatBdt(report.position.shopPayable)} />
            </div>
            <p className="px-4 pb-3 text-[11px] text-ink-soft">এগুলো এখনকার অবস্থা, নির্বাচিত দিনের শেষের নয়।</p>
          </section>
        </>
      )}
    </div>
  );
}
