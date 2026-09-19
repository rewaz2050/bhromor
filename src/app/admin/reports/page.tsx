"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { useNow } from "@/lib/use-now";
import {
  REPORT_RANGES,
  salesReport,
  seriesCsv,
  seriesMax,
  type ReportRange,
} from "@/lib/reports";
import { formatPaisa } from "@/lib/format";
import { csvDateSuffix, downloadText, ordersCsv } from "@/lib/csv";
import { useStaffLive } from "@/lib/use-staff-live";
import { apiErrorMessage, apiGet } from "@/lib/admin-api";
import type { BestSellerRow } from "@/lib/db/reports";
import { IconArrowRight, IconBanknote, IconChart } from "@/components/ui/icons";
import { WEEKDAY_LABELS, hourLabel, hourProfile, zoneDemand } from "@/lib/insights";

/** Sales reports over live orders (pure math in lib/reports.ts). */
export default function AdminReportsPage() {
  const { orders, hasMore, loadMore, loadingMore } = useOrders();
  const [range, setRange] = useState<ReportRange>(REPORT_RANGES[0]);

  /* P2 #4 — the all-time best-seller list from the server: the exact
     numbers the storefront shows (v_product_sales), beyond the 100-row
     order queue the client-side table works from. Staff-only data, so it
     stays quiet (not an error) for a signed-out read-only view. */
  const { live } = useStaffLive();
  const [best, setBest] = useState<BestSellerRow[] | null>(null);
  const [bestError, setBestError] = useState<string | null>(null);
  useEffect(() => {
    if (!live) return;
    let alive = true;
    apiGet<{ bestSellers: BestSellerRow[] }>("/api/admin/reports/best-sellers")
      .then((data) => {
        if (!alive) return;
        setBest(data.bestSellers);
        setBestError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setBest(null);
        setBestError(apiErrorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [live]);

  const report = useMemo(() => salesReport(orders, range), [orders, range]);

  /* P2 #24 — zone-wise demand planning over the same window the page is
     showing. Counts of real orders (never a "forecast"): which zone is
     loud, which weekday carries it, and what that zone buys most. */
  const now = useNow();
  const planningOrders = useMemo(() => {
    if (range.days === null) return orders;
    const cutoff = now - range.days * 86_400_000;
    return orders.filter((o) => o.createdAt >= cutoff);
  }, [now, orders, range]);
  const zoneRows = useMemo(() => zoneDemand(planningOrders), [planningOrders]);
  const zoneHours = useMemo(() => hourProfile(planningOrders), [planningOrders]);
  const max = seriesMax(report.series);
  const hasOrders = report.summary.orders > 0;
  // The client-side figures run over the loaded pages. When older orders
  // exist beyond them, an "All time" or 30-day window is a partial answer —
  // say so, and offer to load the rest, instead of presenting it as total.
  const oldestLoaded = orders.length > 0 ? Math.min(...orders.map((o) => o.createdAt)) : null;
  const windowStart = range.days === null ? null : now - range.days * 86_400_000;
  const partial =
    hasMore && (windowStart === null || (oldestLoaded !== null && oldestLoaded > windowStart));
  const windowOrders = useMemo(
    () => orders.filter((o) => o.createdAt >= report.from && o.createdAt < report.to),
    [orders, report.from, report.to],
  );
  const exportOrders = () => {
    downloadText(
      `prosanti-orders-${range.label.replace(/\s+/g, "")}-${csvDateSuffix(now)}.csv`,
      ordersCsv(windowOrders),
    );
  };
  const exportDaily = () => {
    downloadText(
      `prosanti-daily-${range.label.replace(/\s+/g, "")}-${csvDateSuffix(now)}.csv`,
      seriesCsv(report),
    );
  };

  const kpis = [
    {
      label: "Booked revenue",
      value: formatPaisa(report.summary.booked),
      note: `${report.summary.orders} live order${report.summary.orders === 1 ? "" : "s"}`,
      icon: IconChart,
    },
    {
      label: "Collected",
      value: formatPaisa(report.summary.collected),
      note: "COD at the doorstep · wallet on verification",
      icon: IconBanknote,
    },
    {
      label: "Outstanding",
      value: formatPaisa(report.summary.outstanding),
      note: "still in the pipeline",
      icon: IconBanknote,
    },
    {
      label: "Avg order value",
      value: formatPaisa(report.summary.averageOrder),
      note: `${report.summary.cancelled} cancelled · ${report.summary.cancelledPct}%`,
      icon: IconChart,
    },
  ];

  const tickEvery = Math.max(1, Math.ceil(report.series.length / 9));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Reports
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Live sales figures. Booked ≠ collected until the money arrives —
            cash at delivery, bKash/Nagad when the payment is verified.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportOrders}
            disabled={windowOrders.length === 0}
            className="rounded-full bg-paper px-4 py-2 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-ivory-100 disabled:opacity-50"
          >
            Orders CSV ({windowOrders.length})
          </button>
          <button
            type="button"
            onClick={exportDaily}
            disabled={!hasOrders}
            className="rounded-full bg-paper px-4 py-2 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-ivory-100 disabled:opacity-50"
          >
            Daily CSV
          </button>
        </div>
        <div className="flex rounded-full bg-paper p-1 ring-1 ring-line" role="group" aria-label="Report period">
          {REPORT_RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={r.label === range.label}
              onClick={() => setRange(r)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                r.label === range.label
                  ? "bg-forest-800 text-ivory-50"
                  : "text-ink-soft hover:text-forest-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {partial && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"
          data-testid="report-partial"
        >
          <span>
            These figures cover the {orders.length} most recent orders loaded —
            older orders exist and are not counted yet.
          </span>
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full bg-amber-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load older orders"}
          </button>
        </p>
      )}

      {/* KPI row */}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {k.label}
              </p>
              <k.icon className="h-4 w-4 text-gold-500" />
            </div>
            <p className="mt-2 font-display text-[1.55rem] font-medium leading-none text-forest-900">
              {k.value}
            </p>
            <p className="mt-2 text-xs text-ink-soft">{k.note}</p>
          </div>
        ))}
      </section>

      {/* Revenue-per-day chart (dependency-free CSS bars) */}
      <section aria-label="Revenue per day" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-base font-medium text-forest-900">
            Revenue per day
          </h3>
          <p className="text-xs text-ink-soft">
            {report.series.filter((d) => d.orderCount > 0).length} active day
            {report.series.filter((d) => d.orderCount > 0).length === 1 ? "" : "s"} ·{" "}
            {formatPaisa(max)} best day
          </p>
        </div>

        {!hasOrders ? (
          <div className="mt-6 rounded-xl bg-ivory-100/70 px-5 py-10 text-center">
            <p className="text-sm font-medium text-ink">No orders in this period</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-soft">
              Place a checkout order on the storefront — sales appear here as
              orders are confirmed.
            </p>
          </div>
        ) : (
          <>
            <div
              className="mt-6 flex h-44 items-end gap-1"
              role="img"
              aria-label={`Revenue per day, ${range.label.toLowerCase()}`}
            >
              {report.series.map((d) => {
                const pct = max > 0 ? Math.max(0, d.revenue / max) : 0;
                return (
                  <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div
                      className={`relative w-full rounded-t ${
                        d.revenue > 0
                          ? "bg-gradient-to-t from-forest-800 to-forest-500 transition-opacity group-hover:opacity-80"
                          : "bg-ivory-100"
                      }`}
                      style={{ height: d.revenue > 0 ? `${Math.max(6, pct * 100)}%` : "3px" }}
                    >
                      <span className="sr-only">
                        {d.label}: {d.orderCount} order{d.orderCount === 1 ? "" : "s"},{" "}
                        {formatPaisa(d.revenue)}
                      </span>
                      <span
                        className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-forest-950 px-2 py-1 text-[0.65rem] font-medium text-ivory-50 group-hover:block"
                      >
                        {d.label} · {formatPaisa(d.revenue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1">
              {report.series.map((d, i) => (
                <span
                  key={d.key}
                  className={`flex-1 text-center text-[0.6rem] text-ink-soft ${
                    i % tickEvery === 0 ? "" : "invisible"
                  }`}
                >
                  {d.label}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Best sellers — the storefront's numbers, server-side (P2 #4) */}
      <section aria-label="Best sellers" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-medium text-forest-900">
            Best sellers — what the storefront shows
          </h3>
          <p className="text-xs text-ink-soft">
            All-time, from <code>v_product_sales</code> — the same view behind
            the shop page&rsquo;s &ldquo;N sold&rdquo; badges and &ldquo;Best
            sellers&rdquo; sort.
          </p>
        </div>
        {!live ? (
          <p className="mt-4 text-sm text-ink-soft">
            Sign in as staff to load the all-time best-seller list.
          </p>
        ) : bestError ? (
          <p className="mt-4 text-sm text-rose-700">{bestError}</p>
        ) : best === null ? (
          <p className="mt-4 text-sm text-ink-soft">Loading…</p>
        ) : best.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            No eligible sales yet — the storefront keeps showing no badges and
            no ranking until the first order lands.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-[0.16em] text-ink-soft">
                <th scope="col" className="pb-2 font-semibold">Product</th>
                <th scope="col" className="pb-2 text-right font-semibold">Units sold</th>
                <th scope="col" className="pb-2 text-right font-semibold">Last 30 days</th>
                <th scope="col" className="pb-2 text-right font-semibold">Orders</th>
                <th scope="col" className="pb-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {best.map((p, i) => (
                <tr key={p.productId}>
                  <td className="py-2.5 pr-3">
                    <span className="mr-2 text-xs font-semibold text-gold-600">{i + 1}</span>
                    <Link
                      href={`/product/${p.slug}`}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink">{p.units}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-soft">{p.last30Units}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-soft">{p.orderCount}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-forest-800">
                    {formatPaisa(p.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          Eligible units = non-cancelled orders minus returns the shop has
          completed (refunded). Revenue counts the same lines; return lines
          price at zero.
        </p>
      </section>

      {/* Payment mix — the three pockets the owner reconciles */}
      <section aria-label="By payment method" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-medium text-forest-900">By payment method</h3>
          <p className="text-xs text-ink-soft">
            Cash arrives with the riders; wallet money arrives when you verify it.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {report.payments.map((row) => (
            <div key={row.method} className="rounded-xl bg-ivory-100/70 p-4" data-testid={`pay-${row.method}`}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                {row.label}
              </p>
              <p className="mt-1 font-display text-xl font-medium text-forest-900">
                {formatPaisa(row.collected)}
                <span className="ml-1 text-xs font-normal text-ink-soft">collected</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {row.orders} order{row.orders === 1 ? "" : "s"} · {formatPaisa(row.booked)} booked
              </p>
              {row.awaiting > 0 && (
                <Link
                  href="/admin/payments"
                  className="mt-2 inline-block text-xs font-semibold text-rose-700 underline underline-offset-2"
                >
                  {row.awaiting} awaiting verification →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Top products */}
        <section aria-label="Top products" className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-3">
          <h3 className="font-display text-base font-medium text-forest-900">Top products</h3>
          {report.topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">Nothing sold in this period yet.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th scope="col" className="pb-2 font-semibold">Product</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Units</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Orders</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.topProducts.map((p, i) => (
                  <tr key={p.productId}>
                    <td className="py-2.5 pr-3">
                      <span className="mr-2 text-xs font-semibold text-gold-600">{i + 1}</span>
                      <span className="font-medium text-ink">{p.name}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ink">{p.units}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink-soft">{p.orders}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-forest-800">
                      {formatPaisa(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Names are the ones on each order line at purchase time; cancelled
            orders are excluded. Coupon discounts worth{" "}
            {formatPaisa(report.summary.couponDiscount)} were given in this period.
          </p>
        </section>

        <div className="space-y-6 lg:col-span-2">
          {/* Zones */}
          <section aria-label="By delivery zone" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
            <h3 className="font-display text-base font-medium text-forest-900">By delivery zone</h3>
            {report.zones.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">No orders in this period.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {report.zones.map((z) => (
                  <li key={z.zoneName} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-ink">{z.zoneName}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-forest-800">{formatPaisa(z.revenue)}</span>
                      <span className="text-xs text-ink-soft">{z.orders} order{z.orders === 1 ? "" : "s"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* P2 #24 — zone demand planning */}
          <section
            aria-label="Zone demand planning"
            className="rounded-2xl bg-paper p-6 ring-1 ring-line"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-medium text-forest-900">
                Zone demand &amp; planning
              </h3>
              <p className="text-xs text-ink-soft">
                {range.label} · real orders only — a planning weight, not a prediction
              </p>
            </div>
            {zoneRows.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                No orders in this period — nothing to plan with yet.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-3">
                  {zoneRows.map((z) => (
                    <li key={z.zoneId} className="text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold text-ink">
                          {z.zoneName}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-ink-soft">
                          {Math.round(z.share * 100)}% of orders ·{" "}
                          {z.orders} order{z.orders === 1 ? "" : "s"} ·{" "}
                          {z.units} units
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line/60"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-forest-700"
                          style={{ width: `${Math.max(4, Math.round(z.share * 100))}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                        <span>
                          Loudest day:{" "}
                          <span className="font-semibold text-forest-800">
                            {z.busiest === null ? "—" : WEEKDAY_LABELS[z.busiest]}
                          </span>
                        </span>
                        {z.topProducts.length > 0 ? (
                          <span className="min-w-0 truncate">
                            Buys most:{" "}
                            {z.topProducts
                              .map((tp) => `${tp.name} ×${tp.units}`)
                              .join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {zoneHours.best ? (
                  <p className="mt-4 text-xs leading-5 text-ink-soft">
                    Order rush lands around{" "}
                    <span className="font-semibold text-forest-800">
                      {zoneHours.top.map((h) => hourLabel(h.hour)).join(" · ")}
                    </span>{" "}
                    (Dhaka clock) — station riders and prep hands there first.
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-ink-soft">
                  Weekday and hour buckets are fixed to the Asia/Dhaka clock, and
                  cancelled orders never count — the same rule this whole page
                  prices by. Stock riders and prep shifts to the zones and hours
                  that actually demand them.
                </p>
              </>
            )}
          </section>

          {/* Coupons */}
          <section aria-label="Coupon usage" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-base font-medium text-forest-900">Coupon usage</h3>
              <Link href="/admin/coupons" className="text-xs font-semibold uppercase tracking-widest text-forest-700 hover:text-forest-900">
                Manage
              </Link>
            </div>
            {report.coupons.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">No discount codes used in this period.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {report.coupons.map((c) => (
                  <li key={c.code} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="rounded-full bg-gold-100 px-2 py-0.5 font-mono text-xs font-semibold text-gold-700">
                        {c.code}
                      </span>
                      <span className="ml-2 text-xs text-ink-soft">{c.orders}×</span>
                    </span>
                    <span className="font-semibold tabular-nums text-forest-800">{formatPaisa(c.discount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link
            href="/admin/orders"
            className="flex items-center justify-center gap-2 rounded-2xl bg-forest-800 px-5 py-3.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
          >
            Open orders <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
