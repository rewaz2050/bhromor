"use client";

/**
 * A5 (2026-09-28) — month picker + CSV download for the payout statement.
 *
 * The totals shown here are the same `statementTotals()` the CSV is built
 * from, so the screen and the file can never disagree.
 */

import { useMemo, useState } from "react";
import { downloadText } from "@/lib/csv";
import { formatBdt } from "@/lib/format";
import type { VendorEarnings } from "@/lib/db/vendor";
import {
  monthLabel,
  statementCsv,
  statementFilename,
  statementMonths,
  statementEntries,
  statementTotals,
} from "@/lib/vendor-statement";

export default function StatementBar({ earnings }: { earnings: VendorEarnings }) {
  const months = useMemo(() => statementMonths(earnings), [earnings]);
  // The newest month with rows is the one the shop wants first; no clock is
  // read during render (the rule is right: a render must be reproducible).
  const [month, setMonth] = useState<string>(months[0] ?? "");
  const activeMonth = months.includes(month) ? month : (months[0] ?? month);
  const totals = useMemo(
    () => statementTotals(statementEntries(earnings, activeMonth)),
    [earnings, activeMonth],
  );

  const download = () => {
    downloadText(statementFilename(activeMonth), statementCsv(earnings, activeMonth));
  };

  return (
    <section
      aria-label="Monthly statement"
      data-testid="statement-bar"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Monthly statement
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            One month, every order and payout — the same numbers as the table below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            Month
            <select
              value={activeMonth}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              aria-label="Statement month"
            >
              {(months.length > 0 ? months : [activeMonth]).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={download}
            data-testid="statement-download"
            className="inline-flex min-h-10 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="statement-totals">
        <div>
          <dt className="text-xs text-ink-soft">Delivered orders</dt>
          <dd className="font-display text-xl text-forest-900">{totals.orders}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Your share of sales</dt>
          <dd className="font-display text-xl text-forest-900">{formatBdt(totals.payable)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Paid out this month</dt>
          <dd className="font-display text-xl text-forest-900">{formatBdt(totals.payouts)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.7rem] text-ink-soft">
        Sales {formatBdt(totals.sales)} · commission −{formatBdt(totals.commission)} · net{" "}
        {formatBdt(totals.net)}
        {totals.orders === 0 ? " — nothing delivered in this month." : ""}
      </p>
    </section>
  );
}
