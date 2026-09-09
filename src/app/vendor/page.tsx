"use client";

/**
 * Vendor dashboard (marketplace slice 3): needs-action orders, today's
 * takings, the open/closed sign, and shortcuts into the work queues.
 */

import { useState } from "react";
import Link from "next/link";
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
import {
  patchVendorShop,
  useVendorEarnings,
  useVendorOrders,
  vendorErrorMessage,
} from "@/lib/use-vendor";

export default function VendorDashboardPage() {
  const me = useVendor();
  const authed = me !== null;
  const orders = useVendorOrders(authed);
  const earnings = useVendorEarnings(authed);
  const [toggling, setToggling] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const isOpen = open ?? me?.shop.isOpen ?? false;
  const list = orders.orders;
  const needsAction = list.filter(
    (o) => o.status === "pending" || o.status === "confirmed",
  );
  const inKitchen = list.filter((o) => o.status === "preparing").length;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayRevenue = list
    .filter((o) => o.createdAt >= startOfDay.getTime() && o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);

  const flipOpen = async () => {
    setToggling(true);
    setToggleError(null);
    try {
      const shop = await patchVendorShop({ is_open: !isOpen });
      setOpen(shop.isOpen);
    } catch (err) {
      setToggleError(vendorErrorMessage(err));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Salaam, ${me?.shop.name ?? "vendor"} — today at a glance.`}
        sub={`${me?.role === "owner" ? "Owner" : "Staff"} account · ${me?.shop.prepMinutes ?? 15} min prep · ${Math.round(me?.shop.commissionPct ?? 15)}% commission`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Needs action
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : needsAction.length}
          </p>
          <Link
            href="/vendor/orders?status=pending"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            Open order queue →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Being prepared
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : inKitchen}
          </p>
          <Link
            href="/vendor/orders?status=preparing"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            View →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Today&rsquo;s sales
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : formatBdt(todayRevenue)}
          </p>
          <Link
            href="/vendor/earnings"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            Earnings →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Shop sign
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {isOpen ? "Open" : "Closed"}
          </p>
          <button
            type="button"
            onClick={flipOpen}
            disabled={toggling}
            className="mt-1 text-xs font-semibold text-forest-800 underline underline-offset-2 disabled:opacity-60"
          >
            {toggling ? "Saving…" : isOpen ? "Close the shop" : "Open the shop"}
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="mt-3">
          <ErrorBox message={toggleError} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label="Latest orders">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Latest orders
          </h3>
          {orders.loading ? (
            <Skeleton lines={3} />
          ) : orders.error ? (
            <ErrorBox message={orders.error} onRetry={orders.refresh} />
          ) : list.length === 0 ? (
            <EmptyState
              title="No orders yet"
              sub="When customers order from your shop, new orders land here for confirmation."
            />
          ) : (
            <ul className="space-y-2">
              {list.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/vendor/orders/${encodeURIComponent(o.id)}`}
                    className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line transition hover:ring-forest-400"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-forest-900">
                        {o.id} · {o.customer.name}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {formatDateTime(o.createdAt)} · {formatBdt(o.total)}
                      </p>
                    </div>
                    <StatusPill status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Payout balance">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Payout balance
          </h3>
          {earnings.loading ? (
            <Skeleton lines={2} />
          ) : earnings.error ? (
            <ErrorBox message={earnings.error} onRetry={earnings.refresh} />
          ) : (
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="font-display text-3xl text-forest-900">
                {formatBdt(earnings.earnings?.balance ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Earned {formatBdt(earnings.earnings?.lifetimePayable ?? 0)} ·{" "}
                paid out {formatBdt(earnings.earnings?.lifetimePaid ?? 0)}
              </p>
              <p className="mt-3 text-xs text-ink-soft">
                PROSANTI settles payouts to your bKash/bank account — the
                ledger below updates per delivered order.
              </p>
              <Link
                href="/vendor/earnings"
                className="mt-2 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
              >
                Full earnings →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
