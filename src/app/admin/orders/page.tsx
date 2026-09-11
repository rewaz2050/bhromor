"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import {
  ORDER_FLOW,
  STATUS_META,
  aggregateOrders,
  type OrderStatus,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import { StatusBadge, DOT, friendlyWhen } from "@/components/admin/order-ui";
import { IconSearch } from "@/components/ui/icons";

const FILTERS: (OrderStatus | "all")[] = [
  "all",
  ...ORDER_FLOW,
  "cancelled",
];

/** §33 admin order list with status filters + search. */
export default function AdminOrdersPage() {
  const { orders, live, loading, error, clearError, reset } = useOrders();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => aggregateOrders(orders).byStatus, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...orders]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((o) => (filter === "all" ? true : o.status === filter))
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

  const exportCsv = () => {
    const header = ["OrderID","Customer","Phone","Area","Total","Status","Created"].join(",");
    const rows = visible.map((o) => [o.id, `"${o.customer.name}"`, o.customer.phone, `"${o.customer.area}"`, o.total, o.status, new Date(o.createdAt).toISOString()].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prosanti-orders-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {live && newOrdersCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 animate-pulse">
          <p className="text-sm font-bold text-amber-900">🔔 {newOrdersCount} new pending order(s) — Sunamganj Sadar live! Auto-refresh every 10s, sound + browser notification enabled (free).</p>
          <div className="flex gap-2">
            <button onClick={() => { if ("Notification" in window) Notification.requestPermission(); }} className="rounded-full bg-forest-800 px-3 py-1 text-xs text-white">Enable Browser Alert</button>
            <button onClick={exportCsv} className="rounded-full bg-paper px-3 py-1 text-xs ring-1 ring-line">Export CSV (free)</button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button
            type="button"
            onClick={clearError}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="rounded-full bg-paper px-4 py-2 text-xs font-semibold ring-1 ring-line hover:bg-ivory-100">📥 Export CSV (free)</button>
          <span className="text-[11px] text-ink-soft">Live auto-refresh 10s — no cost, OSM map free, Cloudinary free tier</span>
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
        {FILTERS.map((s) => {
          const active = filter === s;
          const count =
            s === "all"
              ? orders.length
              : counts[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
                active
                  ? "bg-forest-800 text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
              }`}
            >
              {s === "all" ? (
                "All"
              ) : (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[s]}`} aria-hidden />
                  {STATUS_META[s].short}
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
      {visible.length === 0 ? (
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th className="px-5 py-3.5 font-semibold">Order</th>
                  <th className="px-5 py-3.5 font-semibold">Customer</th>
                  <th className="px-5 py-3.5 font-semibold">Items</th>
                  <th className="px-5 py-3.5 font-semibold">Zone</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-3.5 font-semibold">Payment</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
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
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-ink">
                      {formatBdt(o.total)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-ivory-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-soft">
                        COD
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/orders/${o.id}`}>
                        <StatusBadge status={o.status} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
