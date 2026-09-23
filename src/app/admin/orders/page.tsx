"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import {
  PUBLIC_STEPS,
  aggregateOrders,
  type Order,
  type OrderStatus,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { csvDateSuffix, downloadText, ordersCsv } from "@/lib/csv";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import { useNow } from "@/lib/use-now";
import { ageLabel, ageMinutes } from "@/lib/order-actions";
import { StatusBadge, DOT, friendlyWhen } from "@/components/admin/order-ui";
import { PaymentChip } from "@/components/admin/payment-chip";
import { OrderRowActions } from "@/components/admin/order-row-actions";
import { IconSearch } from "@/components/ui/icons";
import AdminDataError from "@/components/admin/admin-data-error";

/**
 * Filter chips follow the four public phases (+ cancelled): eight internal
 * states were eight chips nobody used. "With rider" groups ready-for-pickup,
 * courier-assigned and out-for-delivery — the badge on each row still shows
 * the exact internal state. "Needs action" (2026-09-18) is the work queue:
 * every order that has a button for the shop right now.
 */
type FilterId = "all" | "action" | (typeof PUBLIC_STEPS)[number]["key"] | "cancelled";

/** Statuses where the shop (not a rider) holds the next tap. */
export const ACTION_STATUSES: readonly OrderStatus[] = ["pending", "confirmed", "preparing"];

const FILTERS: { id: FilterId; label: string; statuses: readonly OrderStatus[]; dot: OrderStatus }[] = [
  { id: "all", label: "All", statuses: [], dot: "pending" },
  { id: "action", label: "Needs action", statuses: ACTION_STATUSES, dot: "pending" },
  ...PUBLIC_STEPS.map((step) => ({
    id: step.key as FilterId,
    label: step.adminLabel,
    statuses: step.statuses as readonly OrderStatus[],
    dot: step.statuses[0] as OrderStatus,
  })),
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"], dot: "cancelled" },
];

const FILTER_IDS = new Set<string>(FILTERS.map((f) => f.id));

const filterStatuses = (id: FilterId): readonly OrderStatus[] =>
  FILTERS.find((f) => f.id === id)?.statuses ?? [];

/** Open orders older than this (minutes) are flagged in the list. */
const LATE_AFTER_MIN = 15;

const isOpen = (o: Order): boolean =>
  o.status !== "delivered" && o.status !== "cancelled";

/** Age chip for an open order — rose once it has waited too long. */
function AgeChip({ order, now }: { order: Order; now: number }) {
  if (!isOpen(order)) return null;
  const late =
    ACTION_STATUSES.includes(order.status) &&
    ageMinutes(order.createdAt, now) >= LATE_AFTER_MIN;
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-[0.62rem] font-bold tabular-nums ${
        late ? "bg-rose-100 text-rose-800" : "bg-ivory-100 text-ink-soft"
      }`}
      title={late ? `Waiting ${LATE_AFTER_MIN}+ minutes for the shop` : "Time since placement"}
    >
      ⏱ {ageLabel(order.createdAt, now)}
    </span>
  );
}

/** §33 admin order list with status filters + search + row actions. */
export default function AdminOrdersPage() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const now = useNow(30_000);
  // Deep links from the dashboard (/admin/orders?status=action). Read in an
  // effect, not via useSearchParams — that would force a Suspense boundary
  // and de-opt the page (same reason as /track).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("status");
    if (wanted && FILTER_IDS.has(wanted)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the URL once on mount
      setFilter(wanted as FilterId);
    }
  }, []);
  const pickFilter = (id: FilterId) => {
    setFilter(id);
    const url = new URL(window.location.href);
    if (id === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", id);
    window.history.replaceState(window.history.state, "", url);
  };
  // Debounced server-side search — the list is paginated, so a client-only
  // filter would silently miss orders older than the loaded pages.
  const [serverQuery, setServerQuery] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setServerQuery(query.trim()), 350);
    return () => window.clearTimeout(id);
  }, [query]);
  const {
    orders,
    live,
    loading,
    error,
    clearError,
    reset,
    hasMore,
    loadMore,
    loadingMore,
    advance,
    cancel,
  } = useOrders({ q: serverQuery });

  const counts = useMemo(() => aggregateOrders(orders).byStatus, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = filterStatuses(filter);
    return [...orders]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((o) => (filter === "all" ? true : allowed.includes(o.status)))
      .filter(
        (o) =>
          q === "" ||
          o.id.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.phone.includes(q) ||
          o.items.some((it) => it.name.toLowerCase().includes(q)),
      );
  }, [orders, filter, query]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading orders">
        <div className="h-10 w-full max-w-xs animate-pulse rounded-full bg-paper ring-1 ring-line" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  const newOrdersCount = orders.filter((o) => o.status === "pending").length;
  const actionCount = orders.filter((o) => ACTION_STATUSES.includes(o.status)).length;

  // Spreadsheet export of the rows on screen (lib/csv.ts: taka not paisa,
  // quoted fields, items + payment + rider columns, BOM for Excel).
  const exportCsv = () => {
    downloadText(`prosanti-orders-${csvDateSuffix()}.csv`, ordersCsv(visible));
  };

  return (
    <div className="space-y-6">
      {live && newOrdersCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm font-bold text-amber-900">
            🔔 {newOrdersCount} new order{newOrdersCount === 1 ? "" : "s"} waiting to be confirmed
            {actionCount > newOrdersCount
              ? ` · ${actionCount - newOrdersCount} more ready to hand to a rider`
              : ""}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            {filter !== "action" && (
              <button
                type="button"
                onClick={() => pickFilter("action")}
                className="rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white"
              >
                Show what needs action
              </button>
            )}
            {"Notification" in globalThis &&
              Notification.permission !== "granted" && (
                <Link
                  href="/admin/notifications"
                  className="rounded-full bg-paper px-3 py-1 text-xs ring-1 ring-line"
                  title="Phone notification setup — ek tap e ON korun"
                >
                  🔔 Phone notification ON korun
                </Link>
              )}
          </div>
        </div>
      )}
      <AdminDataError
        label="Orders"
        error={error}
        onRetry={reset}
        onDismiss={clearError}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-full bg-paper px-4 py-2 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100"
          >
            📥 Export CSV
          </button>
          <span className="text-[11px] text-ink-soft">
            Refreshes every 10 s while this tab is open
          </span>
        </div>
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order, customer, phone…"
            aria-label="Search orders"
            className="w-full rounded-full border-0 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count =
            f.id === "all"
              ? orders.length
              : f.statuses.reduce((sum, st) => sum + counts[st], 0);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => pickFilter(f.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
                active
                  ? "bg-forest-800 text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
              }`}
            >
              {f.id === "all" ? (
                "All"
              ) : f.id === "action" ? (
                <>⚡ {f.label}</>
              ) : (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[f.dot]}`} aria-hidden />
                  {f.label}
                </>
              )}
              <span
                className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
                  active ? "bg-white/20 text-ivory-50" : "bg-ivory-100 text-ink-soft"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {visible.length === 0 && !hasMore ? (
        <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No orders found</p>
          <p className="mt-1 text-sm text-ink-soft">
            {query || filter !== "all"
              ? "Try a different search or status filter."
              : "New orders will appear here the moment customers check out."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th className="px-5 py-3.5 font-semibold">Order</th>
                  <th className="px-5 py-3.5 font-semibold">Customer</th>
                  <th className="px-5 py-3.5 font-semibold">Items</th>
                  <th className="px-5 py-3.5 font-semibold">Zone</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-3.5 font-semibold">Payment</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Next step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-ivory-100/70">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-[0.82rem] font-semibold text-forest-800 hover:underline"
                      >
                        {o.id}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {friendlyWhen(o.createdAt)}
                        <AgeChip order={o} now={now} />
                        {o.isReturn && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-900">
                            Return · {o.returnStatus ?? "requested"}
                          </span>
                        )}
                        {o.isPickup && (
                          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-sky-900">
                            🏪 Counter pickup
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{o.customer.name}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {o.customer.area}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-ink-soft">
                      {o.zoneName}
                      {deliverySlotSummary(o) && (
                        <span className="mt-1 block w-fit rounded-full bg-sky-100 px-2 py-0.5 text-[0.62rem] font-bold text-sky-900">
                          🕒 {deliverySlotSummary(o)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-ink">
                      {formatBdt(o.total)}
                    </td>
                    <td className="px-5 py-3.5">
                      <PaymentChip order={o} />
                      {o.isPlus ? (
                        <span
                          className="ml-1 rounded-full bg-forest-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-forest-900 ring-1 ring-forest-200"
                          title="PROSANTI+ member — delivery waived by the database at placement"
                        >
                          👑 PROSANTI+
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/orders/${o.id}`}>
                        <StatusBadge status={o.status} />
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <OrderRowActions order={o} advance={advance} cancel={cancel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasMore ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-ink-soft">
            Showing the newest {orders.length} orders — older ones are still
            in the database.
          </p>
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full bg-paper px-5 py-2 text-sm font-semibold text-forest-800 ring-1 ring-line hover:bg-ivory-100 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load older orders"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
