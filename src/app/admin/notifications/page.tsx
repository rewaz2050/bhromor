"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/use-notifications";
import { useOrders } from "@/lib/use-orders";
import { useCatalog } from "@/lib/use-catalog";
import { useSettings } from "@/lib/use-settings";
import { useReviews } from "@/lib/use-reviews";
import { useNow } from "@/lib/use-now";
import { displayStock } from "@/lib/catalog-store";
import {
  KIND_LABEL,
  agoLabel,
  applyInboxFilter,
  groupByDay,
  inboxCounts,
  inboxHref,
  type InboxFilter,
  type NotifKind,
} from "@/lib/notification-store";
import { aggregateOrders } from "@/lib/orders";
import { statusCounts } from "@/lib/review-store";
import { IconBell, IconCheck } from "@/components/ui/icons";
import AdminDataError from "@/components/admin/admin-data-error";

const KIND_ICON: Record<NotifKind, string> = {
  order: "bg-forest-100 text-forest-800",
  review: "bg-gold-100 text-gold-700",
  stock: "bg-amber-100 text-amber-800",
  system: "bg-ivory-200 text-ink-soft",
};

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "order", label: KIND_LABEL.order },
  { id: "review", label: KIND_LABEL.review },
  { id: "stock", label: KIND_LABEL.stock },
  { id: "system", label: KIND_LABEL.system },
];

/** §35 notifications — live attention summary + readable inbox. */
export default function AdminNotificationsPage() {
  const { notifs, read, readAll, reset, loading, error } = useNotifications();
  const { orders } = useOrders();
  const { products } = useCatalog();
  const { settings } = useSettings();
  const { reviews } = useReviews();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const now = useNow(30_000);

  const counts = useMemo(() => inboxCounts(notifs), [notifs]);
  const agg = useMemo(() => aggregateOrders(orders), [orders]);
  const lowStockCount = useMemo(
    () =>
      products.filter(
        (p) => displayStock(p) > 0 && displayStock(p) <= settings.lowStockThreshold,
      ).length,
    [products, settings],
  );
  const pendingReviews = useMemo(() => statusCounts(reviews).pending, [reviews]);
  const walletPending = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.payment !== "cod" &&
          o.paymentStatus === "pending_verification" &&
          o.status !== "cancelled",
      ).length,
    [orders],
  );

  // Each card opens the queue it counts, pre-filtered (same deep links the
  // dashboard uses) — a number without a door was the old page's problem.
  const needsAttention = [
    {
      label: "Orders needing action",
      value: agg.byStatus.pending + agg.byStatus.confirmed + agg.byStatus.preparing,
      href: "/admin/orders?status=action",
      tone: "text-forest-900",
    },
    {
      label: "Wallet payments to verify",
      value: walletPending,
      href: "/admin/payments",
      tone: walletPending > 0 ? "text-rose-700" : "text-forest-900",
    },
    {
      label: "Reviews in the moderation queue",
      value: pendingReviews,
      href: "/admin/reviews",
      tone: "text-gold-700",
    },
    {
      label: "Products at or below low-stock",
      value: lowStockCount,
      href: "/admin/inventory",
      tone: "text-amber-800",
    },
  ];

  const groups = useMemo(
    () => groupByDay(applyInboxFilter(notifs, filter), now),
    [notifs, filter, now],
  );
  const visibleCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Live “needs attention” — derived from the real stores */}
      <section aria-label="Needs attention" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {needsAttention.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-2xl bg-paper p-5 ring-1 ring-line transition-colors hover:bg-ivory-100"
          >
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {item.label}
            </p>
            <p className={`mt-2 font-display text-3xl font-medium ${item.tone}`}>
              {item.value}
            </p>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-forest-900">
          Inbox
          {counts.unread > 0 && (
            <span className="ml-3 rounded-full bg-gold-500 px-2.5 py-1 text-[0.7rem] font-bold text-white align-middle">
              {counts.unread} unread
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void readAll()}
            disabled={counts.unread === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-50"
          >
            <IconCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
              filter === f.id
                ? "bg-forest-800 text-ivory-50"
                : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
                filter === f.id ? "bg-white/20 text-ivory-50" : "bg-ivory-100 text-ink-soft"
              }`}
            >
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      <AdminDataError label="Inbox" error={error} onRetry={reset} />

      {loading ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">Loading your inbox…</p>
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">
            {filter === "unread" ? "All caught up" : "Nothing here"}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {filter === "unread"
              ? "Every notice has been read. New orders, payments and reviews land here first."
              : "New events will show up as orders arrive, reviews queue and stock runs low."}
          </p>
        </div>
      ) : (
        groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-soft">
            {group.label}
          </h3>
        <ul className="space-y-2.5">
          {group.items.map((n) => {
            const href = inboxHref(n);
            const content = (
              <>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${KIND_ICON[n.kind]}`}>
                  <IconBell className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-sm font-semibold ${n.read ? "text-ink" : "text-forest-900"}`}>
                      {n.title}
                    </span>
                    <span className="rounded-full bg-ivory-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-soft">
                      {KIND_LABEL[n.kind]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-ink-soft">
                    {n.body}
                  </span>
                  <span className="mt-1 block text-xs text-ink-soft/70">
                    {agoLabel(n.at, now)}
                  </span>
                </span>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-label="Unread" />}
              </>
            );
            const cls = `flex items-start gap-4 rounded-2xl p-5 ring-1 transition-colors ${
              n.read ? "bg-ivory-100/50 ring-line/60" : "bg-paper ring-line hover:bg-ivory-100"
            }`;
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className={cls} onClick={() => !n.read && void read(n.id)}>
                    {content}
                  </Link>
                ) : (
                  <div className={cls}>
                    {content}
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => void read(n.id)}
                        className="ml-2 shrink-0 self-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold text-forest-800 ring-1 ring-line hover:bg-ivory-100"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </section>
        ))
      )}

      <p className="text-xs leading-5 text-ink-soft">
        Live inbox — new orders, customer cancellations, wallet payment
        decisions, return and warranty requests, reviews, applications and
        stock alerts land here for every staff member. Refreshes every 15 s
        while this tab is open.
      </p>
    </div>
  );
}
