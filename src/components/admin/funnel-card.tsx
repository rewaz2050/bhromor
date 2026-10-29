"use client";

/**
 * Admin → Reports → "Funnel" (UX plan §0 — measure first).
 *
 * The shop's own first-party numbers from `ps_funnel_report`: sessions,
 * bounce, pages per session, PDP → add-to-cart → checkout → order, AOV and
 * repeat rate, where adds-to-bag come from, the searches people type (zero
 * results flagged = demand we don't stock) and how far down the home page
 * they scroll. 7 / 28-day toggle. Quiet unless signed in as staff; says
 * "run the migration" when the table isn't installed yet.
 */

import { useState } from "react";
import { AdminApiError, apiErrorMessage, apiGet } from "@/lib/admin-api";
import { useScopedRead } from "@/lib/use-scoped-read";
import { INVALID_FUNNEL_RESPONSE, isFunnelReport } from "@/lib/funnel-report-validation";
import { formatPaisa } from "@/lib/format";
import { funnelRates, type FunnelReport } from "@/lib/funnel-events";

type Days = 7 | 28;

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;
const num = (n: number): string => n.toLocaleString("en-IN");

const SOURCE_LABEL: Record<string, string> = {
  card: "Card quick-add",
  pdp: "Product page",
  bundle: "Bundle",
  live: "Live",
  other: "Other",
};

interface FunnelRead {
  report: FunnelReport | null;
  state: "ready" | "missing" | "error";
  error: string | null;
}
const readFunnel = async (key: string): Promise<FunnelRead> => {
  const days: Days = key === "28" ? 28 : 7;
  try {
    const data = await apiGet<unknown>(`/api/admin/reports/funnel?days=${days}`);
    if (!isFunnelReport(data, days)) {
      return { report: null, state: "error", error: INVALID_FUNNEL_RESPONSE };
    }
    return { report: data, state: "ready", error: null };
  } catch (error) {
    const missing = error instanceof AdminApiError && error.status === 503 && error.missing;
    return { report: null, state: missing ? "missing" : "error", error: missing ? null : apiErrorMessage(error) };
  }
};

export default function FunnelCard({ live }: { live: boolean }) {
  const [days, setDays] = useState<Days>(7);
  const resource = useScopedRead(String(days), live, readFunnel, apiErrorMessage);
  const current = resource.data;
  const state = resource.loading ? "loading" : resource.error ? "error" : current?.state ?? "loading";
  const report = resource.loading ? null : current?.report ?? null;
  const error = resource.error ?? current?.error ?? null;
  const rates = report ? funnelRates(report) : null;

  return (
    <section aria-label="Funnel" data-testid="funnel-card" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-medium text-forest-900">
          Funnel — the shop&rsquo;s own numbers
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-ink-soft">Anonymous, per-tab sessions from the storefront itself.</p>
          <div role="group" aria-label="Window" className="flex rounded-full bg-ivory-100 p-0.5">
            {([7, 28] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                  days === d ? "bg-forest-950 text-ivory-50" : "text-forest-800 hover:bg-ivory-200"
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>
      </div>

      {!live ? (
        <p className="mt-4 text-sm text-ink-soft">Sign in as staff to load the funnel.</p>
      ) : state === "missing" ? (
        <div className="mt-4 text-sm text-ink-soft" data-testid="funnel-missing">
          <p>Not installed yet — run <code>supabase/migrations/202609260004_storefront_events.sql</code> in
          the SQL editor. Events start flowing the moment the table exists.</p>
          <button type="button" onClick={() => void resource.refresh()} className="mt-2 min-h-11 font-semibold underline underline-offset-2">Try again</button>
        </div>
      ) : state === "error" ? (
        <div className="mt-4 text-sm text-rose-700">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => void resource.refresh()} className="mt-2 min-h-11 font-semibold underline underline-offset-2">Try again</button>
        </div>
      ) : !report || !rates ? (
        <p className="mt-4 text-sm text-ink-soft">Loading…</p>
      ) : report.sessions === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          No sessions recorded in the last {days} days yet — the storefront starts sending the moment
          someone opens it.
        </p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sessions" value={num(report.sessions)} hint={`${num(report.pageViews)} page views`} />
            <Stat label="Bounce" value={pct(report.bounceRate)} hint="1-page sessions" />
            <Stat label="Pages / session" value={report.pagesPerSession.toFixed(1)} />
            <Stat
              label="Session → order"
              value={pct(rates.sessionToOrder)}
              hint={`${num(report.orders)} orders`}
            />
          </dl>

          <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Steps">
            <Step
              label="Product page → add to bag"
              from={report.pdpSessions}
              to={report.atcSessions}
              rate={rates.pdpToAtc}
            />
            <Step
              label="Add to bag → checkout"
              from={report.atcSessions}
              to={report.checkoutSessions}
              rate={rates.atcToCheckout}
            />
            <Step
              label="Checkout → order"
              from={report.checkoutSessions}
              to={report.orders}
              rate={rates.checkoutToOrder}
            />
          </ol>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Average order" value={report.orders > 0 ? formatPaisa(report.aov) : "—"} />
            <Stat
              label="Repeat customers"
              value={report.customers > 0 ? pct(report.repeatRate) : "—"}
              hint={`${num(report.customers)} customers`}
            />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div>
              <h4 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Add to bag — from where
              </h4>
              {report.atcBySource.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">None yet.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {report.atcBySource.map((s) => (
                    <li
                      key={s.source}
                      className="rounded-full bg-ivory-100 px-3 py-1 text-xs font-medium text-forest-900"
                    >
                      {SOURCE_LABEL[s.source] ?? s.source} · {num(s.count)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Top searches
              </h4>
              {report.topSearches.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No searches yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {report.topSearches.map((s) => (
                    <li key={s.query} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink">
                        {s.query}
                        {s.zeroResults && (
                          <span
                            className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-rose-700"
                            data-testid="zero-results"
                          >
                            no results
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-ink-soft">{num(s.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Home page scroll
              </h4>
              {report.homeScroll.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No home scrolls yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {report.homeScroll.map((row) => (
                    <li key={row.depth} className="flex items-center gap-3 text-sm">
                      <span className="w-10 tabular-nums text-ink-soft">{row.depth}%</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ivory-100">
                        <span
                          className="block h-full rounded-full bg-forest-600"
                          style={{ width: `${Math.round(row.share * 100)}%` }}
                        />
                      </span>
                      <span className="w-10 text-right tabular-nums text-ink">{pct(row.share)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 text-xs text-ink-soft">
            Orders, average order and repeat rate come from the orders table (cancelled and return
            orders excluded); the steps count distinct sessions. A search counts once it rests for a
            second; &ldquo;no results&rdquo; means the shop showed nothing for it.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-ivory-50 px-4 py-3 ring-1 ring-line">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums text-forest-950">{value}</dd>
      {hint && <dd className="text-xs text-ink-soft">{hint}</dd>}
    </div>
  );
}

function Step({ label, from, to, rate }: { label: string; from: number; to: number; rate: number }) {
  return (
    <li className="rounded-xl px-4 py-3 ring-1 ring-line">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-2xl tabular-nums text-forest-950">{pct(rate)}</span>
        <span className="text-xs tabular-nums text-ink-soft">
          {num(from)} → {num(to)}
        </span>
      </p>
    </li>
  );
}
