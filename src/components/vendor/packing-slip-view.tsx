"use client";

/**
 * A6 (2026-09-28) — the printable packing slip (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Its own route (not a modal on the order page): the print CSS only has to
 * hide one button, the shop can bookmark a slip, and this view stays a plain
 * component with a plain `id` prop — which is what the tests render.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useVendor } from "@/components/vendor/vendor-shell";
import { EmptyState, ErrorBox, Skeleton } from "@/components/vendor/vendor-ui";
import { formatBdt } from "@/lib/format";
import { paymentSummary } from "@/lib/payment-labels";
import { useVendorOrder, vendorErrorMessage } from "@/lib/use-vendor";
import { packingSlip, slipPieceCount } from "@/lib/packing-slip";

export default function PackingSlipView({ id }: { id: string }) {
  const me = useVendor();
  const { order, loading, error, refresh } = useVendorOrder(me !== null, id);

  useEffect(() => {
    document.title = order ? `Packing slip ${order.id} — PROSANTI` : "Packing slip — PROSANTI";
  }, [order]);

  if (loading) return <Skeleton lines={5} />;
  if (error) return <ErrorBox message={error || vendorErrorMessage(error)} onRetry={refresh} />;
  if (!order) return <EmptyState title="Order not found" sub="It may have been cancelled." />;

  const slip = packingSlip(order, paymentSummary(order).label);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/vendor/orders/${encodeURIComponent(order.id)}`}
          className="text-xs font-semibold text-forest-800 underline underline-offset-2"
        >
          ← Back to the order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          data-testid="slip-print"
          className="inline-flex min-h-10 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          Print slip
        </button>
      </div>

      <article
        data-testid="packing-slip"
        className="rounded-2xl bg-white p-6 text-ink ring-1 ring-line print:rounded-none print:p-0 print:ring-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Packing slip
            </p>
            <h1 className="font-display text-2xl text-forest-900">{slip.orderNo}</h1>
            <p className="mt-1 text-xs text-ink-soft">
              {new Date(slip.placedAt).toLocaleString("en-GB")} · {slip.status}
            </p>
          </div>
          <div className="text-right text-xs text-ink-soft">
            <p className="font-semibold text-ink">{me?.shop.name}</p>
            <p>{slip.isReturn ? "RETURN PICKUP — do not pack" : `${slipPieceCount(slip)} pieces`}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Deliver to</h2>
            <p className="mt-1 text-sm font-semibold text-ink">{slip.customer.name}</p>
            <p className="text-sm">{slip.customer.phone}</p>
            <p className="text-sm">{slip.customer.address}</p>
            <p className="text-xs text-ink-soft">{order.zoneName}</p>
            {slip.customer.note && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                Note: {slip.customer.note}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Collect</h2>
            <p className="font-display text-2xl text-forest-900">
              {slip.collectOnDelivery > 0 ? formatBdt(slip.collectOnDelivery) : "৳0 — prepaid"}
            </p>
            <p className="text-xs text-ink-soft">{slip.paymentLabel}</p>
          </div>
        </section>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((line) => (
              <tr key={line.label} className="border-b border-line/60">
                <td className="py-2 pr-3">{line.label}</td>
                <td className="py-2 text-right">{line.qty}</td>
                <td className="py-2 text-right">{formatBdt(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Subtotal</dt>
            <dd>{formatBdt(slip.subtotal)}</dd>
          </div>
          {slip.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Discount</dt>
              <dd>−{formatBdt(slip.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-soft">Delivery</dt>
            <dd>{formatBdt(slip.deliveryCharge)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold">
            <dt>Total</dt>
            <dd>{formatBdt(slip.total)}</dd>
          </div>
        </dl>

        <p className="mt-6 border-t border-line pt-3 text-[0.7rem] text-ink-soft">
          Cash on delivery is collected by the rider; PROSANTI settles the shop&rsquo;s share afterwards.
        </p>
      </article>
    </div>
  );
}
