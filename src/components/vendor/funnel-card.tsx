"use client";

/**
 * B4 (2026-09-28) — the shop's own funnel, for the shop's own dashboard.
 *
 * Three promises kept on screen:
 *   1. the steps are PEOPLE, not percentages of nothing — each step shows how
 *      many sessions reached it and how many moved on;
 *   2. a step with too few sessions behind it says "not enough data yet"
 *      instead of showing a conversion rate that is really noise
 *      (`SMALL_BASE` in lib/shop-funnel.ts);
 *   3. the last step counts REAL orders from the orders table — cancelled and
 *      return orders are not a sale — and a week with nothing recorded says so
 *      plainly instead of looking like a verdict.
 *
 * Presentational + plain props: the numbers and the wording come from
 * `lib/shop-funnel.ts`, both testable without a network.
 */

import { useState } from "react";
import { formatBdt } from "@/lib/format";
import { Skeleton } from "@/components/vendor/vendor-ui";
import {
  funnelAdvice,
  funnelIsQuiet,
  funnelSteps,
  type ShopFunnel,
} from "@/lib/shop-funnel";

type Days = 7 | 28;

const pct = (rate: number): string => `${Math.round(rate * 100)}%`;

const SOURCE_LABEL: Record<string, string> = {
  card: "Card quick-add",
  pdp: "Product page",
  bundle: "Bundle",
  live: "Live",
  other: "Other",
};

export default function FunnelCard({
  funnel,
  days = 7,
  loading = false,
  missing = false,
  error = null,
  onDays,
  onRetry,
}: {
  funnel: ShopFunnel | null;
  days?: Days;
  loading?: boolean;
  /** Migration 202609280004 has not been applied yet. */
  missing?: boolean;
  error?: string | null;
  /** Omitted → the toggle is not offered (dashboard card). */
  onDays?: (days: Days) => void;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Your shop funnel"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="funnel-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Your shop funnel
        </h3>
        {onDays && (
          <div className="flex gap-1 text-[0.68rem]" data-testid="funnel-days">
            {([7, 28] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDays(d)}
                aria-pressed={days === d}
                className={`rounded-full px-3 py-1 font-semibold ring-1 ring-line ${
                  days === d ? "bg-forest-800 text-white" : "bg-ivory-100 text-ink-soft"
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton lines={3} />
      ) : missing ? (
        <div className="mt-3 rounded-xl bg-ivory-100 p-4 ring-1 ring-line" data-testid="funnel-missing">
          <p className="text-sm font-semibold text-ink">Not switched on yet</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            Run <code className="rounded bg-paper px-1">202609280004_shop_funnel.sql</code> and this
            card fills in. Until then there is nothing to show — not an empty shop, just no
            measurements.
          </p>
        </div>
      ) : error && !funnel ? (
        <div className="mt-3 rounded-xl bg-ivory-100 p-4 ring-1 ring-line">
          <p className="text-sm text-ink-soft">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-sm font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          )}
        </div>
      ) : !funnel ? null : (
        <>
          {funnelIsQuiet(funnel) ? (
            <p className="mt-3 rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-soft" data-testid="funnel-quiet">
              {funnelAdvice(funnel)}
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="funnel-totals">
                <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
                  <p className="text-[0.68rem] text-ink-soft">Visited your shop</p>
                  <p className="font-display text-xl text-forest-900">{funnel.sessions}</p>
                </div>
                <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
                  <p className="text-[0.68rem] text-ink-soft">Orders</p>
                  <p className="font-display text-xl text-forest-900">{funnel.orders}</p>
                </div>
                <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
                  <p className="text-[0.68rem] text-ink-soft">Revenue ({funnel.days}d)</p>
                  <p className="font-display text-xl text-forest-900">
                    {formatBdt(funnel.revenue)}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2" data-testid="funnel-steps">
                {funnelSteps(funnel).map((step) => (
                  <li
                    key={step.key}
                    data-testid={`funnel-step-${step.key}`}
                    className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{step.label}</span>
                      <span className="text-xs text-ink-soft">
                        {step.to} of {step.from}
                        {step.thin ? "" : ` · ${pct(step.rate)}`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="h-full rounded-full bg-forest-700"
                        style={{ width: `${Math.max(0, Math.min(100, Math.round(step.rate * 100)))}%` }}
                      />
                    </div>
                    {step.thin && (
                      <p className="mt-1 text-[0.68rem] text-ink-soft">
                        Not enough data yet — {step.from}{" "}
                        {step.from === 1 ? "visit" : "visits"} so far.
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-sm leading-6 text-ink" data-testid="funnel-advice">
                {funnelAdvice(funnel)}
              </p>

              <dl className="mt-3 grid gap-2 text-[0.68rem] text-ink-soft sm:grid-cols-3" data-testid="funnel-money">
                <div>
                  <dt>Average order</dt>
                  <dd className="text-sm font-semibold text-ink">
                    {funnel.aov === null ? "—" : formatBdt(funnel.aov)}
                  </dd>
                </div>
                <div>
                  <dt>Pieces sold</dt>
                  <dd className="text-sm font-semibold text-ink">{funnel.units}</dd>
                </div>
                <div>
                  <dt>Storefront page views</dt>
                  <dd className="text-sm font-semibold text-ink">{funnel.pageViews}</dd>
                </div>
              </dl>

              {(funnel.topProducts.length > 0 || funnel.atcBySource.length > 0) && (
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  data-testid="funnel-detail-toggle"
                  className="mt-4 text-xs font-semibold text-forest-800 underline underline-offset-2"
                >
                  {open ? "Hide the details" : "Which products, and where the adds came from"}
                </button>
              )}

              {open && funnel.topProducts.length > 0 && (
                <div className="mt-3 overflow-x-auto" data-testid="funnel-products">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[0.62rem] uppercase tracking-wide text-ink-soft">
                      <tr>
                        <th className="py-1 pr-2">Product</th>
                        <th className="py-1 pr-2 text-right">Seen</th>
                        <th className="py-1 pr-2 text-right">Added</th>
                        <th className="py-1 text-right">Ordered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.topProducts.map((p) => (
                        <tr key={p.productId} className="border-t border-line">
                          <td className="py-1.5 pr-2 text-ink">{p.name}</td>
                          <td className="py-1.5 pr-2 text-right">{p.views}</td>
                          <td className="py-1.5 pr-2 text-right">{p.adds}</td>
                          <td className="py-1.5 text-right font-semibold">{p.orders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1.5 text-[0.62rem] text-ink-soft">
                    “Ordered” counts real orders in this window — cancelled and returned ones
                    are left out.
                  </p>
                </div>
              )}

              {open && funnel.atcBySource.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2 text-[0.68rem]" data-testid="funnel-sources">
                  {funnel.atcBySource.map((s) => (
                    <li key={s.source} className="rounded-full bg-ivory-100 px-3 py-1 ring-1 ring-line">
                      {SOURCE_LABEL[s.source] ?? s.source}: {s.count}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
