"use client";

/**
 * Wallet-payment card on the admin order detail (P1 #8).
 *
 * Renders only for bKash/Nagad orders. While the payment is
 * pending_verification the card tells the shop exactly what to check in its
 * own wallet (TRXID + amount + customer phone) and offers the two decisions:
 *   - Verify — the money is in; the order may start fulfilment;
 *   - Reject — no matching money; the order is cancelled, stock released,
 *     refund to the customer handled offline from the shop wallet.
 */

import { useState } from "react";
import { IconCheck, IconClose, IconShield } from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";

interface PaymentCardProps {
  orderNo: string;
  payment: "cod" | "bkash" | "nagad";
  paymentRef?: string | null;
  paymentStatus?: "pending_verification" | "verified" | "rejected";
  paymentVerifiedAt?: number;
  total: number;
  customerPhone: string;
  /**
   * The order's status. A CANCELLED order can only settle its wallet payment
   * as rejected (verify is refused by the server too) — for legacy rows that
   * still say pending on a cancelled order we hide the Verify button so the
   * staff UI never offers a decision that cannot succeed.
   */
  orderStatus?: string;
  /** Re-read the order after a decision. */
  onDecided: () => Promise<unknown> | void;
  /**
   * Who is deciding. The staff card posts to /api/admin/…; the vendor card
   * (2026-09-18) posts to /api/vendor/… — the shop verifies its own wallet.
   */
  actor?: "staff" | "vendor";
}

const endpointFor = (actor: "staff" | "vendor", orderNo: string): string =>
  actor === "vendor"
    ? `/api/vendor/orders/${encodeURIComponent(orderNo)}/payment`
    : `/api/admin/orders/${encodeURIComponent(orderNo)}/payment`;

const fmt = (ms?: number): string =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function PaymentCard({
  orderNo,
  payment,
  paymentRef,
  paymentStatus,
  paymentVerifiedAt,
  total,
  customerPhone,
  orderStatus,
  onDecided,
  actor = "staff",
}: PaymentCardProps) {
  const [busy, setBusy] = useState<"verified" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (payment === "cod") return null;

  const method = payment === "bkash" ? "bKash" : "Nagad";

  const decide = async (action: "verified" | "rejected") => {
    let note: string | undefined;
    if (action === "rejected") {
      const prompted = window.prompt(
        "Reject this payment? The order will be CANCELLED and stock released. A short note is stored with the decision:",
      );
      if (prompted === null) return; // dismissed
      note = prompted.trim();
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(endpointFor(actor, orderNo), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "The decision could not be saved — try again.");
        return;
      }
      await onDecided();
    } catch {
      setError("Could not reach the server — check your connection.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider text-amber-900">
        <IconShield className="h-3.5 w-3.5" />
        {method} payment — {formatBdt(total)}
      </p>
      <p className="mt-1 text-xs leading-5">
        <span className="font-semibold">TRXID:</span>{" "}
        <span className="font-mono">{paymentRef || "—"}</span>
        <br />
        <span className="font-semibold">Customer:</span> {customerPhone}
      </p>
      {paymentStatus === "pending_verification" && (
        <>
          <p className="mt-2 text-xs leading-5">
            {orderStatus === "cancelled" ? (
              <>
                This order was cancelled while the payment was still pending —
                record it as rejected.
              </>
            ) : (
              <>
                Check your {method} wallet: money of {formatBdt(total)} from
                the customer with the TRXID above? Then verify. No match?
                Reject — the order is cancelled and the refund is handled from
                your wallet.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {orderStatus !== "cancelled" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("verified")}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
              >
                <IconCheck className="h-3.5 w-3.5" />
                {busy === "verified" ? "Verifying…" : "Payment verified"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void decide("rejected")}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              <IconClose className="h-3.5 w-3.5" />
              {busy === "rejected" ? "Rejecting…" : "Reject payment"}
            </button>
          </div>
        </>
      )}
      {paymentStatus === "verified" && (
        <p className="mt-2 text-xs font-medium text-emerald-800">
          ✓ Verified {fmt(paymentVerifiedAt)} —{" "}
          {orderStatus === "cancelled"
            ? "the order was cancelled afterwards; refund from the shop wallet (offline)."
            : "the order may start fulfilment."}
        </p>
      )}
      {paymentStatus === "rejected" && (
        <p className="mt-2 text-xs font-medium text-rose-800">
          ✕ Rejected {fmt(paymentVerifiedAt)} — order cancelled, stock
          released. Refund from the shop wallet (offline).
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
