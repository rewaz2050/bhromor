/**
 * Net platform P&L (audit N7, migration 202610010003). Pure maths + windows,
 * shared by the API route, the page and the tests so the screen can never
 * disagree with the arithmetic that is unit-tested.
 */

export interface MoneyPnl {
  deliveredOrders: number;
  returnLegs: number;
  commission: number;
  deliveryIncome: number;
  shopFundedFreeDelivery: number;
  riderFees: number;
  /** Signed journal sum: positive = credited to riders (a cost). */
  riderAdjustments: number;
  discountsGiven: number;
  shopFundedDiscounts: number;
  tipsCollected: number;
  tipsToRiders: number;
}

export interface NetResult {
  revenue: number;
  riderCost: number;
  platformDiscounts: number;
  net: number;
  /** Net per delivered (non-return) order, in paisa; null when none. */
  perOrder: number | null;
  /** Delivery charges minus rider pay, per delivered order — the unit economics of a trip. */
  deliveryMarginPerOrder: number | null;
  /** Tips collected but not (yet) credited to riders — owed pass-through. */
  tipsHeld: number;
}

export const computeNet = (p: MoneyPnl): NetResult => {
  const revenue = p.commission + p.deliveryIncome + p.shopFundedFreeDelivery;
  const riderCost = p.riderFees + p.riderAdjustments;
  // The shop's payable ignores platform coupons, so the platform absorbs the
  // part of the discount the shop does not fund (never negative).
  const platformDiscounts = Math.max(0, p.discountsGiven - p.shopFundedDiscounts);
  const net = revenue - riderCost - platformDiscounts;
  const n = p.deliveredOrders;
  return {
    revenue,
    riderCost,
    platformDiscounts,
    net,
    perOrder: n > 0 ? Math.round(net / n) : null,
    deliveryMarginPerOrder:
      n > 0 ? Math.round((p.deliveryIncome + p.shopFundedFreeDelivery - riderCost) / n) : null,
    tipsHeld: p.tipsCollected - p.tipsToRiders,
  };
};

export const PNL_RANGES = ["today", "7d", "30d", "all"] as const;
export type PnlRange = (typeof PNL_RANGES)[number];

export const parsePnlRange = (value: unknown): PnlRange =>
  typeof value === "string" && (PNL_RANGES as readonly string[]).includes(value)
    ? (value as PnlRange)
    : "30d";

const DHAKA_OFFSET_MS = 6 * 3_600_000; // Asia/Dhaka is UTC+6, no DST

/** [from, to) in ISO for a range; open ends are null. "today" starts at Dhaka midnight. */
export const pnlWindow = (
  range: PnlRange,
  now: Date = new Date(),
): { from: string | null; to: string | null } => {
  if (range === "all") return { from: null, to: null };
  if (range === "today") {
    const local = now.getTime() + DHAKA_OFFSET_MS;
    const midnightLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
    return { from: new Date(midnightLocal - DHAKA_OFFSET_MS).toISOString(), to: null };
  }
  const days = range === "7d" ? 7 : 30;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: null };
};
