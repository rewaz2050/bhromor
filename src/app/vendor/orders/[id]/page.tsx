"use client";

/**
 * Vendor order detail (marketplace slice 3): items, customer + delivery,
 * timeline, and the vendor's status moves — two taps: Confirm → Ready (call
 * rider); "Start preparing" is optional (2026-09-17, migration 202609170001).
 * Cancel stays available early. Dispatch states are read-only here.
 */

import { useEffect, use, useState } from "react";
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
import type { OrderStatus } from "@/lib/orders";
import { paymentSummary } from "@/lib/payment-labels";
import { canQuickCancel, primaryAction } from "@/lib/order-actions";
import { useVendorOrder, vendorErrorMessage } from "@/lib/use-vendor";
import PaymentCard from "@/components/admin/payment-card";
import { deliverySlotSummary } from "@/lib/delivery-slots";

/** Optional extra step — packing takes a while and the customer should see it. */
const OPTIONAL_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  confirmed: { to: "preparing", label: "Start preparing (optional)" },
};

function PrepTimer({ createdAt, prepMinutes = 15 }: { createdAt: number; prepMinutes?: number }) {
  const [now, setNow] = useState(createdAt);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt current epoch on mount
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const target = createdAt + prepMinutes * 60 * 1000;
  const diffMs = target - now;
  const remainingMin = Math.max(0, Math.ceil(diffMs / (60 * 1000)));
  const isOverdue = diffMs < 0;

  return (
    <div
      className={`mb-4 flex items-center justify-between rounded-2xl p-4 ring-1 ${
        isOverdue
          ? "bg-rose-50 text-rose-900 ring-rose-200"
          : "bg-amber-50 text-amber-900 ring-amber-200"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">⏱️</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            {isOverdue ? "প্যাকিং সময় অতিক্রান্ত" : "প্যাকিং কাউন্টডাউন (Prep Clock)"}
          </p>
          <p className="text-xs text-ink-soft">
            {isOverdue
              ? "দ্রুত পার্সেল রেডি করুন যাতে ৪৫-৬০ মিনিটে কাস্টমারকে দেওয়া যায়"
              : `লক্ষ্য: ${prepMinutes} মিনিটের মধ্যে পার্সেল রেডি করে 'Ready — request riders' চাপুন`}
          </p>
        </div>
      </div>
      <div className="text-right font-mono font-bold text-lg">
        {isOverdue ? "লেট" : `${remainingMin} মিনিট`}
      </div>
    </div>
  );
}

export default function VendorOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orderNo = decodeURIComponent(id);
  const me = useVendor();
  const authed = me !== null;
  const { order, loading, error, refresh, reload, advance } = useVendorOrder(authed, orderNo);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const move = async (to: OrderStatus) => {
    if (!order) return;
    if (to === "cancelled" && !window.confirm(`Cancel order ${order.id}? Reserved stock is released.`)) return;
    setBusy(to);
    setActionError(null);
    try {
      // `advance` re-reads in place (no skeleton flash) — the status pill
      // and buttons update while the rest of the page stays put.
      await advance(to);
    } catch (err) {
      setActionError(vendorErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={orderNo} />
        <Skeleton lines={4} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div>
        <PageHeader title={orderNo} />
        {error ? (
          <ErrorBox message={error} onRetry={refresh} />
        ) : (
          <EmptyState title="Order not found" />
        )}
        <p className="mt-4">
          <Link
            href="/vendor/orders"
            className="text-sm font-semibold text-forest-800 underline underline-offset-2"
          >
            ← Back to orders
          </Link>
        </p>
      </div>
    );
  }

  const action = primaryAction(order, "vendor");
  const next = action?.kind === "action" ? action : null;
  const optional = OPTIONAL_ACTION[order.status];
  const canCancel = canQuickCancel(order);
  const pay = paymentSummary(order);
  const where = order.isPickup
    ? "Counter pickup — customer collects at Traffic Point"
    : order.zoneName;

  return (
    <div>
      <PageHeader
        title={order.id}
        sub={`${formatDateTime(order.createdAt)} · ${where} · ${pay.label}`}
        action={<StatusPill status={order.status} />}
      />

      {actionError && (
        <div className="mb-4">
          <ErrorBox message={actionError} />
        </div>
      )}

      {(order.status === "confirmed" || order.status === "preparing") && (
        <PrepTimer createdAt={order.createdAt} prepMinutes={me?.shop.prepMinutes ?? 15} />
      )}

      {pay.awaitingVerification && order.status !== "cancelled" && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">
            💳 {pay.wallet} payment of {formatBdt(order.total)} is waiting for YOUR check.
          </p>
          <p className="mt-1 text-xs leading-5">
            Open your {pay.wallet} app, find the TRXID below, then verify — the order cannot be
            marked Ready until you do. No money? Reject it and the order is cancelled.
          </p>
        </div>
      )}
      {action?.kind === "blocked" && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {action.reason}.
        </p>
      )}
      {action?.kind === "wait" && (
        <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">
          {action.reason}
        </p>
      )}

      {(next || canCancel) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {next && (
            <button
              type="button"
              onClick={() => move(next.to)}
              disabled={busy !== null}
              className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
            >
              {busy === next.to ? "Saving…" : next.label}
            </button>
          )}
          {optional && !pay.awaitingVerification && (
            <button
              type="button"
              onClick={() => move(optional.to)}
              disabled={busy !== null}
              className="rounded-xl bg-paper px-4 py-2.5 text-sm font-medium text-ink-soft ring-1 ring-line hover:text-forest-900 disabled:opacity-60"
            >
              {busy === optional.to ? "Saving…" : optional.label}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => move("cancelled")}
              disabled={busy !== null}
              className="rounded-xl bg-paper px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60"
            >
              {busy === "cancelled" ? "Saving…" : "Cancel order"}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Items
          </h3>
          <ul className="mt-3 space-y-2">
            {order.items.map((it, i) => (
              <li
                key={`${it.productId}-${i}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-forest-900">
                    {it.name}{" "}
                    <span className="text-ink-soft">× {it.qty}</span>
                  </span>
                  {it.variant && (
                    <span className="block text-xs text-ink-soft">
                      {it.variant}
                    </span>
                  )}
                </span>
                <span className="font-semibold text-forest-900">
                  {formatBdt(it.unitPrice * it.qty)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Subtotal</dt>
              <dd className="font-medium">{formatBdt(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Delivery</dt>
              <dd className="font-medium">{formatBdt(order.deliveryCharge)}</dd>
            </div>
            {order.coupon && (
              <div className="flex justify-between text-emerald-700">
                <dt>Coupon · {order.coupon.code}</dt>
                <dd>−{formatBdt(order.coupon.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-forest-900">
              <dt>Total · {pay.short}</dt>
              <dd>{formatBdt(order.total)}</dd>
            </div>
            <p className="text-xs text-ink-soft">
              {pay.prepaid
                ? `${pay.label} — nobody collects cash.`
                : order.isPickup
                  ? "Cash at your counter when the customer collects."
                  : "Cash on delivery — the rider collects and settles with PROSANTI."}
            </p>
          </dl>
          <PaymentCard
            actor="vendor"
            orderNo={order.id}
            payment={order.payment}
            paymentRef={order.paymentRef}
            paymentStatus={order.paymentStatus}
            paymentVerifiedAt={order.paymentVerifiedAt}
            total={order.total}
            customerPhone={order.customer.phone}
            orderStatus={order.status}
            onDecided={reload}
          />
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl bg-paper p-5 ring-1 ring-line">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {order.isPickup ? "Customer — collects at the counter" : "Customer + delivery"}
            </h3>
            <p className="mt-2 text-sm font-semibold text-forest-900">
              {order.customer.name}
            </p>
            <p className="text-sm text-ink-soft">
              <a href={`tel:${order.customer.phone}`} className="underline underline-offset-2">
                {order.customer.phone}
              </a>
            </p>
            {order.isPickup ? (
              <p className="mt-1 text-sm text-ink-soft">
                🏪 No delivery — the customer picks this up at Traffic Point
                {deliverySlotSummary(order) ? ` · ${deliverySlotSummary(order)}` : ""}.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink-soft">
                  {order.customer.address ?? order.customer.area} · {order.zoneName}
                </p>
                {deliverySlotSummary(order) && (
                  <p className="mt-1 text-xs font-semibold text-sky-900">
                    🕒 Customer asked for: {deliverySlotSummary(order)}
                  </p>
                )}
                {order.etaLabel && (
                  <p className="mt-1 text-xs text-ink-soft">
                    Promised: {order.etaLabel}
                  </p>
                )}
              </>
            )}
            {order.customer.note && (
              <p className="mt-2 rounded-xl bg-ivory-100 px-3 py-2 text-xs italic text-ink">
                “{order.customer.note}”
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-paper p-5 ring-1 ring-line">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Timeline
            </h3>
            <ol className="mt-2 space-y-2">
              {order.timeline.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <StatusPill status={t.status} />
                  <span className="text-xs text-ink-soft">
                    {formatDateTime(t.at)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <p className="mt-6">
        <Link
          href="/vendor/orders"
          className="text-sm font-semibold text-forest-800 underline underline-offset-2"
        >
          ← Back to orders
        </Link>
      </p>
    </div>
  );
}
