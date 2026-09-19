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
  PUBLIC_STEPS,
} from "@/lib/orders";
import { displayStock } from "@/lib/catalog-store";
import { formatBdt } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { ageLabel, oldestOf } from "@/lib/order-actions";
import {
  StatusBadge,
  DOT,
  friendlyWhen,
} from "@/components/admin/order-ui";
import LiveSetupBanner from "@/components/admin/live-setup-banner";
import AdminDataError from "@/components/admin/admin-data-error";
import { AdminSlaAlerts } from "@/components/admin/admin-sla-alerts";
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
  const { orders, error: ordersError, clearError: clearOrdersError, reset: reloadOrders } = useOrders();

  const agg = useMemo(() => aggregateOrders(orders), [orders]);
  const perf = useMemo(() => deliveryStats(orders), [orders]);
  const now = useNow(30_000);
  // The dashboard is an action queue: each card says how long the OLDEST
  // order in that bucket has been waiting, so the person on shift knows
  // whether "3 awaiting" means thirty seconds or forty minutes.
  const oldestAction = oldestOf(orders, ["pending", "confirmed", "preparing"]);
  const oldestRider = oldestOf(orders, ["ready-for-pickup", "courier-assigned"]);
  const oldestOut = oldestOf(orders, ["out-for-delivery"]);
  const waitingNote = (oldest: number | null, idle: string): string =>
    oldest === null ? idle : `oldest waiting ${ageLabel(oldest, now)}`;
  const walletPending = orders.filter(
    (o) =>
      o.payment !== "cod" &&
      o.paymentStatus === "pending_verification" &&
      o.status !== "cancelled",
  ).length;

  const recent = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [orders],
  );

  // Live pipeline in the four public phases — the internal states inside
  // each one are summed (an order "with rider" may be ready / assigned /
  // on the way; the list page's badge still shows which).
  const liveFlow = PUBLIC_STEPS.filter((step) => step.key !== "delivered");
  const {
    products: catalogProducts,
    error: catalogError,
    clearError: clearCatalogError,
    reset: reloadCatalog,
  } = useCatalog();
  const {
    settings,
    error: settingsError,
    clearError: clearSettingsError,
    reset: reloadSettings,
  } = useSettings();
  const threshold = settings.lowStockThreshold;
  const lowStock = catalogProducts.filter(
    (p) => displayStock(p) > 0 && displayStock(p) <= threshold,
  );

  const actionCount = agg.byStatus.pending + agg.byStatus.confirmed + agg.byStatus.preparing;
  const cards = [
    {
      label: "Today's sales",
      value: formatBdt(agg.todaySales),
      note: `${agg.todayOrders} order${agg.todayOrders === 1 ? "" : "s"} today`,
      icon: IconShield,
      urgent: false,
    },
    {
      label: "Needs your tap",
      value: String(actionCount),
      note: waitingNote(oldestAction, "nothing waiting on the shop"),
      icon: IconClock,
      href: "/admin/orders?status=action",
      urgent: oldestAction !== null && now - oldestAction > 15 * 60_000,
    },
    {
      label: "Waiting for rider",
      value: String(
        agg.byStatus["ready-for-pickup"] + agg.byStatus["courier-assigned"],
      ),
      note: waitingNote(oldestRider, "no parcel waiting at the shop"),
      icon: IconBox,
      href: "/admin/deliveries",
      urgent: oldestRider !== null && now - oldestRider > 30 * 60_000,
    },
    {
      label: "On the road",
      value: String(agg.byStatus["out-for-delivery"]),
      note: waitingNote(oldestOut, "no rider out right now"),
      icon: IconTruck,
      href: "/admin/orders?status=picked-up",
      urgent: false,
    },
  ];

  return (
    <div className="space-y-8">
      <LiveSetupBanner />
      <AdminDataError label="Orders" error={ordersError} onRetry={reloadOrders} onDismiss={clearOrdersError} />
      <AdminDataError label="Catalog" error={catalogError} onRetry={reloadCatalog} onDismiss={clearCatalogError} />
      <AdminDataError label="Settings" error={settingsError} onRetry={reloadSettings} onDismiss={clearSettingsError} />
      {/* KPI cards — each one is the door to its queue */}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                  {c.label}
                </p>
                <c.icon className={`h-4 w-4 ${c.urgent ? "text-rose-600" : "text-gold-500"}`} />
              </div>
              <p className="mt-2 font-display text-[1.7rem] font-medium leading-none text-forest-900">
                {c.value}
              </p>
              <p className={`mt-2 inline-flex items-center gap-1 text-xs ${c.urgent ? "font-semibold text-rose-700" : "text-ink-soft"}`}>
                {c.note}
                {c.href && <IconArrowRight className="h-3 w-3" />}
              </p>
            </>
          );
          const cls = `block rounded-2xl bg-paper p-5 ring-1 ${
            c.urgent ? "ring-rose-300" : "ring-line"
          }`;
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition-shadow hover:shadow-md`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </section>

      {walletPending > 0 && (
        <Link
          href="/admin/orders?status=action"
          className="flex items-center justify-between rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
        >
          <span>
            💳 {walletPending} bKash/Nagad payment{walletPending === 1 ? "" : "s"} waiting for verification — check the wallet, then verify or reject.
          </span>
          <IconArrowRight className="h-4 w-4" />
        </Link>
      )}

      {/* Late orders — the same SLA list as the dispatch board, on the page
          staff actually keep open. */}
      <AdminSlaAlerts orders={orders} />

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
            {liveFlow.map((step) => {
              const count = step.statuses.reduce(
                (sum, st) => sum + agg.byStatus[st],
                0,
              );
              return (
                <li key={step.key}>
                  <Link
                    href={`/admin/orders?status=${step.key}`}
                    className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-ivory-100"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[step.statuses[0]]}`} aria-hidden />
                    <span className="flex-1 text-sm font-medium text-ink">
                      {step.adminLabel}
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
                    {p.media?.[0]?.src ? (
                      <Image
                        src={p.media[0].src}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ivory-100 text-[0.55rem] font-bold uppercase tracking-wider text-ink-soft ring-1 ring-line"
                      >
                        No img
                      </span>
                    )}
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

        </div>
      </div>
    </div>
  );
}
