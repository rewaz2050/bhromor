/**
 * A6 (2026-09-28) — the packing slip (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * A parcel is packed at a table, away from the screen: whoever folds the
 * panjabi needs one sheet with the order number, what goes in the bag, the
 * address, and — for cash orders — exactly how much to collect. Everything
 * here comes off the order row; nothing is recomputed from the catalog,
 * because the price that matters is the one the customer actually agreed to.
 */

import type { Order } from "./orders";

export interface SlipLine {
  /** "2× Cotton panjabi — M (SKU-12)" */
  label: string;
  qty: number;
  /** Line total in paisa (qty × the price at purchase time). */
  amount: number;
}

export interface PackingSlip {
  orderNo: string;
  placedAt: number;
  status: string;
  customer: { name: string; phone: string; address: string; note: string };
  lines: SlipLine[];
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  paymentLabel: string;
  /** Cash the rider must collect, in paisa; 0 when nothing is due. */
  collectOnDelivery: number;
  /** Packing hint for a return pickup (the shop sends nothing). */
  isReturn: boolean;
}

export const slipLines = (order: Order): SlipLine[] =>
  order.items.map((item) => ({
    label: `${item.name}${item.variant ? ` — ${item.variant}` : ""}${item.sku ? ` (${item.sku})` : ""}`,
    qty: item.qty,
    amount: item.qty * item.unitPrice,
  }));

/**
 * What the rider collects. A delivery of an unpaid wallet order is 0 —
 * the platform already holds the money — and a delivered order collects
 * nothing either way.
 */
export const collectOnDelivery = (order: Order): number => {
  if (order.status === "cancelled") return 0;
  if (order.payment !== "cod") return 0;
  return order.total;
};

export const packingSlip = (order: Order, paymentLabel: string): PackingSlip => {
  const lines = slipLines(order);
  return {
    orderNo: order.id,
    placedAt: order.createdAt,
    status: order.status,
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address ?? order.customer.area ?? "",
      note: order.customer.note ?? "",
    },
    lines,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.coupon?.discount ?? 0,
    total: order.total,
    paymentLabel,
    collectOnDelivery: collectOnDelivery(order),
    isReturn: Boolean(order.isReturn),
  };
};

/** "3 pieces" / "1 piece" — the number the packer checks against the bag. */
export const slipPieceCount = (slip: PackingSlip): number =>
  slip.lines.reduce((sum, line) => sum + line.qty, 0);

/** One-line summary for the slip footer, e.g. "2× Panjabi, 1× Stole". */
export const slipPackList = (slip: PackingSlip): string =>
  slip.lines.map((line) => `${line.qty}× ${line.label}`).join(", ");
