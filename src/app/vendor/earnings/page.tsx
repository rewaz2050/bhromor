"use client";

/**
 * Vendor earnings (marketplace slice 3): per-order ledger, payout history,
 * and the running balance. Ledger rows start landing once delivered
 * orders settle (the settlement writer is slice 5).
 */

import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  Skeleton,
  formatDateTime,
} from "@/components/vendor/vendor-ui";
import { formatBdt } from "@/lib/format";
import { useVendorEarnings } from "@/lib/use-vendor";

export default function VendorEarningsPage() {
  const me = useVendor();
  const { earnings, loading, error, refresh } = useVendorEarnings(me !== null);

  return (
    <div>
      <PageHeader
        title="Earnings"
        sub={`PROSANTI keeps ${Math.round(me?.shop.commissionPct ?? 15)}% per order — the rest is yours.`}
      />

      {loading ? (
        <Skeleton lines={3} />
      ) : error ? (
        <ErrorBox message={error} onRetry={refresh} />
      ) : !earnings ||
        (earnings.ledger.length === 0 && earnings.payouts.length === 0) ? (
        <EmptyState
          title="No earnings yet"
          sub="Each delivered order adds a ledger row here with your share. Payouts settle to your bKash/bank account."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Lifetime earned
              </p>
              <p className="mt-1 font-display text-2xl text-forest-900">
                {formatBdt(earnings.lifetimePayable)}
              </p>
            </div>
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Paid out
              </p>
              <p className="mt-1 font-display text-2xl text-forest-900">
                {formatBdt(earnings.lifetimePaid)}
              </p>
            </div>
            <div className="rounded-2xl bg-forest-800 p-5 ring-1 ring-forest-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-forest-100">
                Balance due
              </p>
              <p className="mt-1 font-display text-2xl text-white">
                {formatBdt(earnings.balance)}
              </p>
            </div>
          </div>

          {earnings.ledger.length > 0 && (
            <section aria-label="Ledger">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Per-order ledger
              </h3>
              <div className="overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                      <th className="px-4 py-3 font-semibold">Settled</th>
                      <th className="px-4 py-3 font-semibold">Order</th>
                      <th className="px-4 py-3 text-right font-semibold">Sale</th>
                      <th className="px-4 py-3 text-right font-semibold">Fee</th>
                      <th className="px-4 py-3 text-right font-semibold">Yours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.ledger.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2.5 text-xs text-ink-soft">
                          {formatDateTime(r.at)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {r.orderId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {formatBdt(r.subtotal)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-soft">
                          −{formatBdt(r.commission)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-forest-900">
                          {formatBdt(r.payable)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {earnings.payouts.length > 0 && (
            <section aria-label="Payouts">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Payouts
              </h3>
              <ul className="space-y-2">
                {earnings.payouts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 text-sm ring-1 ring-line"
                  >
                    <span>
                      <span className="font-semibold text-forest-900">
                        {formatBdt(p.amount)}
                      </span>{" "}
                      <span className="text-ink-soft">
                        via {p.method}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-ink-soft">
                      {formatDateTime(p.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
