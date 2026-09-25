"use client";

/**
 * Vendor order queue (marketplace slice 3): filter by status, act on the
 * order right from the row (2026-09-18 — Confirm / Ready without opening
 * the detail page), jump into the detail view for the rest.
 */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  Skeleton,
  StatusPill,
  formatDateTime,
} from "@/components/vendor/vendor-ui";
import { PaymentChip } from "@/components/admin/payment-chip";
import { formatBdt } from "@/lib/format";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import { useNow } from "@/lib/use-now";
import { ageLabel, ageMinutes, primaryAction } from "@/lib/order-actions";
import type { Order, OrderStatus } from "@/lib/orders";
import { useVendorOrders, vendorErrorMessage } from "@/lib/use-vendor";

const FILTERS: { id: string; label: string; statuses: readonly OrderStatus[] }[] = [
  { id: "all", label: "All", statuses: [] },
  { id: "pending", label: "New", statuses: ["pending"] },
  { id: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { id: "preparing", label: "Preparing", statuses: ["preparing"] },
  { id: "ready-for-pickup", label: "Ready for rider", statuses: ["ready-for-pickup"] },
  { id: "delivered", label: "Delivered", statuses: ["delivered"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

/** A new order still unconfirmed after this many minutes is flagged. */
const LATE_AFTER_MIN = 10;

function Queue() {
  const me = useVendor();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const { orders, loading, error, refresh, advance } = useVendorOrders(
    me !== null,
    status,
  );
  // Counts for the chips come from the unfiltered list so "New (3)" is
  // visible while you look at Delivered. On the "All" tab that IS the list,
  // so the second read only happens on a filtered tab.
  const unfiltered = useVendorOrders(me !== null && status !== "all", "all");
  const allOrders = status === "all" ? orders : unfiltered.orders;
  const now = useNow(30_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const o of allOrders) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }, [allOrders]);
  const countFor = (f: (typeof FILTERS)[number]): number =>
    f.id === "all"
      ? allOrders.length
      : f.statuses.reduce((sum, st) => sum + (counts[st] ?? 0), 0);

  const act = async (order: Order, to: OrderStatus) => {
    setBusy(order.id);
    setRowError(null);
    try {
      await advance(order.id, to);
      if (status !== "all") unfiltered.reload();
    } catch (err) {
      setRowError({ id: order.id, message: vendorErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const newCount = counts.pending ?? 0;

  return (
    <div>
      <PageHeader
        title="Orders"
        sub={
          newCount > 0
            ? `${newCount} new order${newCount === 1 ? "" : "s"} waiting for your Confirm — the customer's clock is running.`
            : "Confirm new orders fast — the kitchen clock starts with you. This list refreshes itself."
        }
      />
      <p className="mb-4 rounded-xl border border-line bg-paper p-3 text-sm text-ink-soft">
        অর্ডার গ্রহণ করুন → প্যাকিং শেষে Ready করুন → এলাকার অনলাইন রাইডারদের অনুরোধ যাবে। যিনি আগে গ্রহণ করবেন, তিনিই পিকআপ করবেন—Admin-এর অপেক্ষা করতে হবে না।
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.id;
          const href =
            f.id === "all" ? "/vendor/orders" : `/vendor/orders?status=${f.id}`;
          const n = countFor(f);
          return (
            <Link
              key={f.id}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-forest-800 text-white"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:bg-cream"
              }`}
            >
              {f.label}
              {n > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
                    active
                      ? "bg-white/20 text-white"
                      : f.id === "pending"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-ivory-100 text-ink-soft"
                  }`}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorBox message={error} onRetry={refresh} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders here"
          sub={
            status === "all"
              ? "New customer orders will appear here."
              : `Nothing with the “${status}” status right now.`
          }
        />
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const action = primaryAction(o, "vendor");
            const late =
              o.status === "pending" && ageMinutes(o.createdAt, now) >= LATE_AFTER_MIN;
            const open = o.status !== "delivered" && o.status !== "cancelled";
            return (
              <li
                key={o.id}
                className={`rounded-2xl bg-paper ring-1 transition ${
                  late ? "ring-rose-300" : "ring-line hover:ring-forest-400"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link
                    href={`/vendor/orders/${encodeURIComponent(o.id)}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-semibold text-forest-900">
                      {o.id} · {o.customer.name}
                      {open && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[0.62rem] font-bold tabular-nums ${
                            late ? "bg-rose-100 text-rose-800" : "bg-ivory-100 text-ink-soft"
                          }`}
                        >
                          ⏱ {ageLabel(o.createdAt, now)}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      {o.items.length} item{o.items.length === 1 ? "" : "s"} ·{" "}
                      {o.isPickup ? "🏪 counter pickup" : o.zoneName} · {formatDateTime(o.createdAt)}
                      {deliverySlotSummary(o) ? ` · 🕒 ${deliverySlotSummary(o)}` : ""}
                    </p>
                  </Link>
                  <PaymentChip order={o} />
                  <span className="text-sm font-semibold text-forest-900">
                    {formatBdt(o.total)}
                  </span>
                  <StatusPill status={o.status} />
                  {action?.kind === "action" && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(o, action.to)}
                      className="rounded-full bg-forest-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
                    >
                      {busy === o.id ? "Saving…" : action.label}
                    </button>
                  )}
                  {action?.kind === "blocked" && (
                    <Link
                      href={`/vendor/orders/${encodeURIComponent(o.id)}`}
                      className="rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
                    >
                      Verify payment
                    </Link>
                  )}
                  {action?.kind === "wait" && (
                    <span className="text-xs text-ink-soft">{action.reason}</span>
                  )}
                </div>
                {rowError?.id === o.id && (
                  <p role="alert" className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-800">
                    {rowError.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function VendorOrdersPage() {
  return (
    <Suspense fallback={<Skeleton lines={4} />}>
      <Queue />
    </Suspense>
  );
}
