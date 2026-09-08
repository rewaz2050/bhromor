"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrders } from "@/lib/use-orders";
import {
  ORDER_FLOW,
  STATUS_META,
  canCancel,
  flowIndex,
  normalizePhone,
  nextActions,
  type OrderStatus,
} from "@/lib/orders";
import { formatBdt } from "@/lib/format";
import {
  DOT,
  StatusBadge,
  clockTime,
  friendlyWhen,
} from "@/components/admin/order-ui";
import { IconArrowRight, IconClock } from "@/components/ui/icons";

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { orders, advance, cancel } = useOrders();

  const order = useMemo(
    () => orders.find((o) => o.id === params.id),
    [orders, params.id],
  );

  if (!order) {
    return (
      <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
        <p className="font-display text-lg text-forest-900">Order not found</p>
        <p className="mt-1 text-sm text-ink-soft">
          It may belong to a different demo dataset.
        </p>
        <Link
          href="/admin/orders"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-medium text-ivory-50 hover:bg-forest-700"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  const steps = nextActions(order.status);
  const cancellable = canCancel(order.status);
  const flowPos = flowIndex(order.status);
  const isCancelled = order.status === "cancelled";

  const doAdvance = (to: OrderStatus) => {
    if (to === "cancelled") {
      if (!window.confirm("Cancel this order? This cannot be undone in the demo.")) return;
      cancel(order.id);
      return;
    }
    advance(order.id, to);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/orders"
          className="text-sm text-ink-soft transition-colors hover:text-forest-800"
        >
          ← Orders
        </Link>
        <h2 className="font-mono text-lg font-semibold text-forest-900">
          {order.id}
        </h2>
        <StatusBadge status={order.status} />
        <span className="ml-auto text-sm text-ink-soft">
          Placed {friendlyWhen(order.createdAt)}
        </span>
      </div>

      {/* Actions — only legal transitions are offered (§34) */}
      {(steps.length > 0 || cancellable) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4 ring-1 ring-line">
          {steps.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => doAdvance(to)}
              className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
            >
              Mark {STATUS_META[to].label.toLowerCase()}
              <IconArrowRight className="h-4 w-4" />
            </button>
          ))}
          {cancellable && (
            <button
              type="button"
              onClick={() => doAdvance("cancelled")}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
            >
              Cancel order
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + totals */}
        <section
          aria-label="Ordered items"
          className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-2"
        >
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Items · snapshot at purchase (§75)
          </h3>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center gap-4 py-4">
                <Image
                  src={it.image}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{it.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {it.variant} · {it.sku} · {formatBdt(it.unitPrice)} each
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-ink">
                    {formatBdt(it.unitPrice * it.qty)}
                  </p>
                  <p className="text-xs text-ink-soft">× {it.qty}</p>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-ink-soft">
              <dt>Subtotal</dt>
              <dd>{formatBdt(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>
                Delivery · {order.etaLabel}
              </dt>
              <dd>{formatBdt(order.deliveryCharge)}</dd>
            </div>
            {order.coupon && (
              <div className="flex justify-between text-emerald-700">
                <dt>Coupon · {order.coupon.code}</dt>
                <dd>−{formatBdt(order.coupon.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-forest-900">
              <dt>Total (COD)</dt>
              <dd>{formatBdt(order.total)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          {/* Customer */}
          <section
            aria-label="Customer and delivery"
            className="rounded-2xl bg-paper p-6 ring-1 ring-line"
          >
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Customer & delivery
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-soft">Name</dt>
                <dd className="font-medium text-ink">{order.customer.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Phone</dt>
                {/* Staff need the real number to confirm a COD order — this
                    used to be masked, making the panel unusable for calls. */}
                <dd className="font-medium text-ink">
                  <a
                    href={`tel:+88${normalizePhone(order.customer.phone)}`}
                    className="text-forest-800 underline underline-offset-4 hover:text-forest-600"
                  >
                    {order.customer.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Area</dt>
                <dd className="font-medium text-ink">{order.customer.area}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Address</dt>
                <dd className="leading-6 text-ink">
                  {order.customer.address ?? "—"}
                </dd>
              </div>
              {order.customer.note && (
                <div>
                  <dt className="text-xs text-ink-soft">Order note</dt>
                  <dd className="italic leading-6 text-ink">“{order.customer.note}”</dd>
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-soft">
                <IconClock className="h-3.5 w-3.5" />
                Zone: {order.zoneName}
              </div>
            </dl>
          </section>

          {/* Status rail */}
          <section
            aria-label="Status timeline"
            className="rounded-2xl bg-paper p-6 ring-1 ring-line"
          >
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Journey
            </h3>
            <ol className="mt-5">
              {ORDER_FLOW.map((s, i) => {
                const reached = !isCancelled && flowPos >= i;
                const isCurrent = !isCancelled && flowPos === i;
                const last = i === ORDER_FLOW.length - 1;
                const entry = order.timeline.find((t) => t.status === s);
                return (
                  <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last && (
                      <span
                        aria-hidden
                        className={`absolute left-[9px] top-6 h-full w-px ${
                          flowPos > i && !isCancelled ? "bg-forest-300" : "bg-line"
                        }`}
                      />
                    )}
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ring-4 ring-paper ${
                        reached ? DOT[s] : "bg-ivory-200"
                      } ${isCurrent ? "shadow-[0_0_0_2px_#1b3a2d]" : ""}`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          reached ? "text-ink" : "text-ink-soft/70"
                        }`}
                      >
                        {STATUS_META[s].label}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                            Now
                          </span>
                        )}
                      </p>
                      {entry && (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {clockTime(entry.at)}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
              {isCancelled && (
                <li className="relative flex gap-4 pt-4">
                  <span className="mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-rose-400 ring-4 ring-paper" />
                  <div>
                    <p className="text-sm font-medium text-rose-800">
                      Cancelled
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {clockTime(order.timeline.at(-1)!.at)}
                      {order.timeline.at(-1)!.note ? ` · ${order.timeline.at(-1)!.note}` : ""}
                    </p>
                  </div>
                </li>
              )}
            </ol>
            {order.status === "delivered" && order.deliveredMinutes && (
              <p className="mt-5 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900">
                Delivered in {order.deliveredMinutes} min
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
