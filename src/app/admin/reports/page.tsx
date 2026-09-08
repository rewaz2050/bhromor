"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import {
  REPORT_RANGES,
  salesReport,
  seriesMax,
  type ReportRange,
} from "@/lib/reports";
import { formatPaisa } from "@/lib/format";
import { IconArrowRight, IconBanknote, IconChart } from "@/components/ui/icons";

/** Sales reports over the demo order store (pure math in lib/reports.ts). */
export default function AdminReportsPage() {
  const { orders } = useOrders();
  const [range, setRange] = useState<ReportRange>(REPORT_RANGES[0]);

  const report = useMemo(() => salesReport(orders, range), [orders, range]);
  const max = seriesMax(report.series);
  const hasOrders = report.summary.orders > 0;

  const kpis = [
    {
      label: "Booked revenue",
      value: formatPaisa(report.summary.booked),
      note: `${report.summary.orders} live order${report.summary.orders === 1 ? "" : "s"}`,
      icon: IconChart,
    },
    {
      label: "Collected (delivered)",
      value: formatPaisa(report.summary.collected),
      note: "cash at the doorstep — COD",
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
            Sales figures computed live from the order store (§32). Every
            amount is integer paisa (§69); booked ≠ collected until COD cash
            arrives at delivery.
          </p>
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
              Place a checkout order on the storefront, or reset the demo
              orders in Settings to re-seed today&apos;s sample data.
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
            Names are snapshots from each order line (§75); cancelled orders are
            excluded. Coupon discounts worth {formatPaisa(report.summary.couponDiscount)} were given
            in this period (§56).
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
