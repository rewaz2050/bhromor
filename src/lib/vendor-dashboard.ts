/**
 * Vendor dashboard maths (2026-09-27, Phase 2) — pure, so the numbers the
 * shop owner reads can be tested without a browser.
 *
 * The dashboard used to lump `pending` and `confirmed` into one "Needs
 * action" card and count today's takings only: an order that had been
 * sitting unconfirmed for twenty minutes looked exactly like one that
 * arrived ten seconds ago, and a shop with five cancellations in a day
 * could not see them anywhere.
 */

import type { Order, OrderStatus } from "./orders";

/** An order this old without an answer is "running late" on the dashboard. */
export const LATE_ORDER_MS = 10 * 60 * 1000;

export interface NeedsAction {
  /** Placed but not yet confirmed — the shop's first job. */
  fresh: Order[];
  /** Confirmed and being prepared. */
  preparing: Order[];
  /** Ready and waiting for a rider. */
  readyForRider: Order[];
  /** pending|confirmed older than LATE_ORDER_MS, oldest first. */
  late: Order[];
}

export const splitNeedsAction = (
  orders: Order[],
  now = Date.now(),
  lateMs = LATE_ORDER_MS,
): NeedsAction => {
  const fresh = orders.filter((o) => o.status === "pending");
  const preparing = orders.filter((o) => o.status === "preparing");
  const readyForRider = orders.filter((o) => o.status === "ready-for-pickup");
  const late = orders
    .filter(
      (o) =>
        (o.status === "pending" || o.status === "confirmed") &&
        now - o.createdAt > lateMs,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  return { fresh, preparing, readyForRider, late };
};

export const isLateOrder = (order: Order, now = Date.now(), lateMs = LATE_ORDER_MS): boolean =>
  (order.status === "pending" || order.status === "confirmed") &&
  now - order.createdAt > lateMs;

export interface TodayStats {
  /** Non-cancelled orders placed today. */
  orders: number;
  /** Takings (paisa) over those orders — cancellations never count. */
  revenue: number;
  /** Average order value (paisa), 0 when there are no orders. */
  average: number;
  cancelled: number;
}

export const todayStats = (orders: Order[], now = Date.now()): TodayStats => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const today = orders.filter((o) => o.createdAt >= startMs);
  const kept = today.filter((o) => o.status !== "cancelled");
  const revenue = kept.reduce((sum, o) => sum + o.total, 0);
  return {
    orders: kept.length,
    revenue,
    average: kept.length === 0 ? 0 : Math.round(revenue / kept.length),
    cancelled: today.length - kept.length,
  };
};

/** The storefront path a shop shares with customers. */
export const shopPath = (slug: string): string => `/shops/${encodeURIComponent(slug)}`;

/** Order statuses a rider is coming for (used by the dashboard's copy). */
export const RIDER_WAITING: readonly OrderStatus[] = ["ready-for-pickup"] as const;

/**
 * Which orders should ring the bell on the dashboard. Returns the orders
 * that are NEW relative to `seenIds`, oldest first. The first payload after
 * a page load never rings (nothing is "new" yet) — that is the caller's
 * job; this helper only compares ids.
 */
export const newOrderIds = (seenIds: readonly string[], orders: Order[]): string[] =>
  orders
    .filter((o) => !seenIds.includes(o.id))
    .map((o) => o.id)
    .reverse();

// ─── A2 · Service score (2026-09-28) ────────────────────────────────────────
//
// A shop could see today's takings and a late-order warning, but nothing
// that said "how is this shop doing" over a week: a shop with one
// cancellation in thirty orders and a shop that cancels every third order
// looked identical. Every number below is counted from orders the dashboard
// already loads — nothing is scored that the database cannot prove, and a
// shop with no orders in the window gets `null`s (shown as "nothing to
// score yet") rather than a fake 0%.

/** The window the dashboard scores (items A2 of the upgrade plan). */
export const SERVICE_WINDOW_DAYS = 7;
export const SERVICE_WINDOW_MS = SERVICE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Statuses that mean "the shop finished its part": the parcel is on the
 * shelf for the rider. `ready-for-pickup` is the shop's own promise end;
 * the later states are listed too because a fast order may only carry the
 * later mark in its timeline.
 */
const DISPATCH_MARKS: readonly OrderStatus[] = ["ready-for-pickup", "courier-assigned", "out-for-delivery", "delivered"];

/** When the shop handed the parcel over — the first dispatch mark it has. */
export const shopDispatchAt = (order: Order): number | null => {
  const marks = order.timeline
    .filter((entry) => DISPATCH_MARKS.includes(entry.status))
    .map((entry) => entry.at)
    .sort((a, b) => a - b);
  return marks.length > 0 ? marks[0] : null;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export interface ServiceScore {
  windowDays: number;
  /** Orders the shop received in the window (return pickups excluded). */
  placed: number;
  cancelled: number;
  /** Share of placed orders that were NOT cancelled, 0..1; null with no orders. */
  fulfilmentRate: number | null;
  /** Orders that reached the shelf (had a dispatch mark in their timeline). */
  dispatched: number;
  /** Median minutes from placement to dispatch; null when nothing was dispatched. */
  medianDispatchMinutes: number | null;
  /** Share dispatched within the shop's own prep time; null when unknown. */
  onTimeRate: number | null;
  /** Return pickups for this shop's orders in the window. */
  returns: number;
  /** Of those, the ones the shop already refunded. */
  refunded: number;
}

export const serviceScore = (
  orders: Order[],
  options: { now?: number; windowMs?: number; prepMinutes?: number } = {},
): ServiceScore => {
  const { now = Date.now(), windowMs = SERVICE_WINDOW_MS, prepMinutes = 0 } = options;
  const since = now - windowMs;
  // A return pickup is an errand, not a sale the shop is scoring itself on.
  const sales = orders.filter((o) => !o.isReturn);
  const inWindow = sales.filter((o) => o.createdAt >= since);
  const placed = inWindow.length;
  const cancelled = inWindow.filter((o) => o.status === "cancelled").length;

  const dispatchMinutes = inWindow
    .map((o) => {
      const at = shopDispatchAt(o);
      return at === null ? null : Math.max(0, Math.round((at - o.createdAt) / 60000));
    })
    .filter((m): m is number => m !== null);

  const onTime =
    prepMinutes > 0 && dispatchMinutes.length > 0
      ? dispatchMinutes.filter((m) => m <= prepMinutes).length / dispatchMinutes.length
      : null;

  const returns = orders.filter((o) => o.isReturn && o.createdAt >= since);

  return {
    windowDays: Math.round(windowMs / (24 * 60 * 60 * 1000)),
    placed,
    cancelled,
    fulfilmentRate: placed === 0 ? null : (placed - cancelled) / placed,
    dispatched: dispatchMinutes.length,
    medianDispatchMinutes: median(dispatchMinutes),
    onTimeRate: onTime,
    returns: returns.length,
    refunded: returns.filter((o) => o.returnStatus === "refunded").length,
  };
};
