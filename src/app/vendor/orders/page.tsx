"use client";

/**
 * Vendor order queue (marketplace slice 3): filter by status, jump into
 * the detail view to confirm / prepare / mark ready.
 */

import { Suspense } from "react";
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
import { formatBdt } from "@/lib/format";
import { useVendorOrders } from "@/lib/use-vendor";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "preparing", label: "Preparing" },
  { id: "ready-for-pickup", label: "Ready" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

function Queue() {
  const me = useVendor();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const { orders, loading, error, refresh } = useVendorOrders(
    me !== null,
    status,
  );

  return (
    <div>
      <PageHeader
        title="Orders"
        sub="Confirm new orders fast — the kitchen clock starts with you."
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.id;
          const href =
            f.id === "all" ? "/vendor/orders" : `/vendor/orders?status=${f.id}`;
          return (
            <Link
              key={f.id}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-forest-800 text-white"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:bg-cream"
              }`}
            >
              {f.label}
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
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/vendor/orders/${encodeURIComponent(o.id)}`}
                className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line transition hover:ring-forest-400"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-forest-900">
                    {o.id} · {o.customer.name}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {o.items.length} item{o.items.length === 1 ? "" : "s"} ·{" "}
                    {o.zoneName} · {formatDateTime(o.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-forest-900">
                  {formatBdt(o.total)}
                </span>
                <StatusPill status={o.status} />
              </Link>
            </li>
          ))}
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
