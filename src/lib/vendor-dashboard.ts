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
