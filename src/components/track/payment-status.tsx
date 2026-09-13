"use client";

/**
 * Wallet-payment status strip on the track page (P1 #14→#8).
 *
 * Only wallet orders (bKash/Nagad) render anything — COD orders stay
 * exactly as before. The copy is deliberately precise about what the system
 * knows: the money was reported by the customer, the shop's wallet check is
 * the verification, and the order only moves once the shop confirms.
 */

import { IconCheck, IconShield } from "@/components/ui/icons";
import type { Order } from "@/lib/orders";

export default function PaymentStatus({ order }: { order: Order }) {
  if (order.payment === "cod" || !order.paymentStatus) return null;

  const method = order.payment === "bkash" ? "bKash" : "Nagad";

  // A cancelled order can never be "under verification" — legacy rows that
  // predate the auto-reject-on-cancel rule show as not accepted, which is
  // what actually happened (the order is over, the wallet money is not in).
  const paymentStatus =
    order.status === "cancelled" && order.paymentStatus === "pending_verification"
      ? "rejected"
      : order.paymentStatus;

  if (paymentStatus === "verified") {
    return (
      <section
        aria-label="Payment status"
        className="flex items-start gap-3 rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
          <IconCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            {method} payment verified
          </p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-800">
            {order.status === "cancelled" ? (
              <>
                The shop has confirmed your payment in its wallet. The order
                was cancelled afterwards, so the refund comes from the
                shop&apos;s wallet — if you do not receive it, call the shop
                with the order ID.
              </>
            ) : (
              <>
                The shop has confirmed your payment in its wallet — the order
                continues normally from here.
              </>
            )}
          </p>
        </div>
      </section>
    );
  }

  if (paymentStatus === "rejected") {
    return (
      <section
        aria-label="Payment status"
        className="flex items-start gap-3 rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white">
          <IconShield className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-rose-900">
            {method} payment not accepted
          </p>
          <p className="mt-0.5 text-xs leading-5 text-rose-800">
            The shop could not match this payment in its wallet, so the order
            was cancelled. The refund comes from the shop&apos;s wallet — if
            you do not receive it, call the shop with the order ID.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Payment status"
      className="flex items-start gap-3 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
        <IconShield className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-amber-900">
          {method} payment — under verification
        </p>
        <p className="mt-0.5 text-xs leading-5 text-amber-800">
          The shop is checking the payment in its wallet
          {order.paymentRef ? (
            <>
              {" "}
              (TRXID <span className="font-mono">{order.paymentRef}</span>)
            </>
          ) : null}
          . Your order starts as soon as it is confirmed — tracking keeps
          updating.
        </p>
      </div>
    </section>
  );
}
