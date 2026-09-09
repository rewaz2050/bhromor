"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useOrders } from "@/lib/use-orders";
import { useCatalog } from "@/lib/use-catalog";
import { useSettings } from "@/lib/use-settings";
import {
  aggregateOrders,
  deliveryStats,
  ORDER_FLOW,
  STATUS_META,
} from "@/lib/orders";
import { displayStock } from "@/lib/catalog-store";
import { formatBdt } from "@/lib/format";
import {
  StatusBadge,
  DOT,
  friendlyWhen,
} from "@/components/admin/order-ui";
import {
  IconArrowRight,
  IconBox,
  IconClock,
  IconLeaf,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

/** §32 operational overview + §88 delivery performance. */
export default function AdminDashboard() {
  const { orders } = useOrders();

  const agg = useMemo(() => aggregateOrders(orders), [orders]);
  const perf = useMemo(() => deliveryStats(orders), [orders]);

  const recent = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [orders],
  );

  const liveFlow = ORDER_FLOW.filter((s) => s !== "delivered");
  const { products: catalogProducts } = useCatalog();
  const { settings } = useSettings();
  const threshold = settings.lowStockThreshold;
  const lowStock = catalogProducts.filter(
    (p) => displayStock(p) > 0 && displayStock(p) <= threshold,
  );

  const cards = [
    {
      label: "Today's sales",
      value: formatBdt(agg.todaySales),
      note: `${agg.todayOrders} order${agg.todayOrders === 1 ? "" : "s"} today`,
      icon: IconShield,
    },
    {
      label: "Awaiting action",
      value: String(agg.newOrders),
      note: "pending + confirmed",
      icon: IconClock,
      href: "/admin/orders",
    },
    {
      label: "Preparing",
      value: String(agg.byStatus.preparing),
      note: "being packed now",
      icon: IconBox,
      href: "/admin/orders",
    },
    {
      label: "Out for delivery",
      value: String(agg.byStatus["out-for-delivery"]),
      note: "on the road",
      icon: IconTruck,
      href: "/admin/orders",
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl bg-paper p-5 ring-1 ring-line"
          >
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {c.label}
              </p>
              <c.icon className="h-4 w-4 text-gold-500" />
            </div>
            <p className="mt-2 font-display text-[1.7rem] font-medium leading-none text-forest-900">
              {c.value}
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              {c.href ? (
                <Link href={c.href} className="inline-flex items-center gap-1 hover:text-forest-700">
                  {c.note} <IconArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                c.note
              )}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Live order pipeline */}
        <section
          aria-label="Order pipeline"
          className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-3"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium text-forest-900">
              Live pipeline
            </h2>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold uppercase tracking-widest text-forest-700 hover:text-forest-900"
            >
              Manage orders
            </Link>
          </div>

          <ul className="mt-5 space-y-3">
            {liveFlow.map((s) => {
              const count = agg.byStatus[s];
              return (
                <li key={s}>
                  <Link
                    href="/admin/orders"
                    className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-ivory-100"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} aria-hidden />
                    <span className="flex-1 text-sm font-medium text-ink">
                      {STATUS_META[s].label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        count > 0 ? "bg-forest-800 text-ivory-50" : "bg-ivory-100 text-ink-soft"
                      }`}
                    >
                      {count}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="flex items-center gap-4 px-3 pt-1 text-sm text-ink-soft">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT.delivered}`} aria-hidden />
              Delivered today:{" "}
              <span className="font-semibold text-emerald-700">
                {agg.byStatus.delivered}
              </span>
            </li>
          </ul>

          {/* Recent orders */}
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              Latest orders
            </h3>
            <ul className="mt-2 divide-y divide-line">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-forest-800"
                  >
                    <span className="font-mono text-[0.8rem] font-medium text-forest-800">
                      {o.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">
                      {o.customer.name} · {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </span>
                    <span className="hidden text-ink-soft sm:block">
                      {friendlyWhen(o.createdAt)}
                    </span>
                    <span className="font-medium text-ink">{formatBdt(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="space-y-6 lg:col-span-2">
          {/* §88 delivery performance */}
          <section
            aria-label="Delivery performance"
            className="rounded-2xl bg-forest-950 p-6 text-ivory-100"
          >
            <div className="flex items-center gap-2">
              <IconTruck className="h-4 w-4 text-gold-300" />
              <h2 className="font-display text-lg font-medium">
                Delivery performance
              </h2>
            </div>
            {perf.count > 0 ? (
              <dl className="mt-5 grid grid-cols-2 gap-4">
                {[
                  { label: "Average", value: `${perf.averageMinutes} min` },
                  { label: "Median", value: `${perf.medianMinutes} min` },
                  { label: "Under 50 min", value: `${perf.under50Pct}%` },
                  { label: "Measured", value: `${perf.count} orders` },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl bg-white/5 px-4 py-3">
                    <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-ivory-100/50">
                      {row.label}
                    </dt>
                    <dd className="mt-1 font-display text-xl font-medium text-gold-200">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm leading-6 text-ivory-100/60">
                No completed deliveries measured yet — the 45–50 minute target
                becomes a KPI once orders are delivered (§88).
              </p>
            )}
          </section>

          {/* §58 low stock */}
          <section aria-label="Low stock" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <IconLeaf className="h-4 w-4 text-gold-500" />
                <h2 className="font-display text-lg font-medium text-forest-900">
                  Low stock
                </h2>
              </div>
              <Link
                href="/admin/inventory"
                className="text-xs font-semibold uppercase tracking-widest text-forest-700 hover:text-forest-900"
              >
                Manage
              </Link>
            </div>
            {lowStock.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Image
                      src={p.media?.[0]?.src || "/file.svg"}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-soft">
                        {p.colors?.[0] || "No colour"} · {p.sizes?.[0] || "No size"} — {p.sku || "No SKU"}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.7rem] font-bold text-amber-900">
                      {displayStock(p)} left
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">All stock healthy.</p>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
              Alert threshold: {threshold} units · manage in Inventory.
            </p>
          </section>

          <p className="rounded-xl bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-soft">
            Demo mode — figures come from seeded sample orders and are stored
            in this browser only. They become live Supabase data in the
            backend phase.
          </p>
        </div>
      </div>
    </div>
  );
}
