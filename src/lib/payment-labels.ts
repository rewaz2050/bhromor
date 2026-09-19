/**
 * One answer to "how is this order paid, and does anyone collect cash?" for
 * every operator surface (admin list/detail, vendor queue/detail, rider card).
 *
 * Operator audit 2026-09-18 (Batch H): the vendor page said "Cash on
 * delivery" for every order and the rider card said "collect ৳X" for every
 * order — including bKash/Nagad orders the customer had already paid. The
 * database was right (ps_rider_deliver credits cash only for COD); the
 * screens people act on were not. Pure module, unit-tested.
 */

import type { Order } from "./orders";

export type WalletName = "bKash" | "Nagad";

export const walletName = (
  payment: Order["payment"] | null | undefined,
): WalletName | null =>
  payment === "bkash" ? "bKash" : payment === "nagad" ? "Nagad" : null;

export type PaymentTone = "neutral" | "pending" | "ok" | "rejected";

export interface PaymentSummary {
  method: Order["payment"];
  wallet: WalletName | null;
  /** Chip text: "COD" · "bKash · verify" · "bKash ✓" · "bKash · rejected". */
  short: string;
  /** Sentence for detail views. */
  label: string;
  tone: PaymentTone;
  /** The money is (or is claimed to be) in the shop wallet — no cash at the door. */
  prepaid: boolean;
  /** Fulfilment is gated until staff verifies the wallet payment. */
  awaitingVerification: boolean;
}

export const paymentSummary = (
  order: Pick<Order, "payment" | "paymentStatus" | "status">,
): PaymentSummary => {
  const method = order.payment ?? "cod";
  const wallet = walletName(method);
  if (!wallet) {
    return {
      method: "cod",
      wallet: null,
      short: "COD",
      label: "Cash on delivery",
      tone: "neutral",
      prepaid: false,
      awaitingVerification: false,
    };
  }
  const status = order.paymentStatus ?? "pending_verification";
  if (status === "verified") {
    return {
      method,
      wallet,
      short: `${wallet} ✓`,
      label: `Paid by ${wallet} — verified`,
      tone: "ok",
      prepaid: true,
      awaitingVerification: false,
    };
  }
  if (status === "rejected" || order.status === "cancelled") {
    return {
      method,
      wallet,
      short: `${wallet} · rejected`,
      label: `${wallet} payment rejected — order cancelled`,
      tone: "rejected",
      prepaid: false,
      awaitingVerification: false,
    };
  }
  return {
    method,
    wallet,
    short: `${wallet} · verify`,
    label: `${wallet} payment awaiting verification`,
    tone: "pending",
    prepaid: true,
    awaitingVerification: true,
  };
};

/**
 * Cash the rider collects at the door, in paisa. Zero for a return pickup
 * (goods flow the other way) and for ANY wallet order — a wallet order is
 * either paid into the shop wallet or it never reaches a rider (the status
 * machine refuses fulfilment until the payment is verified).
 */
export const cashToCollect = (
  order: Pick<Order, "payment" | "total" | "isReturn">,
): number => (order.isReturn || walletName(order.payment) ? 0 : order.total);
