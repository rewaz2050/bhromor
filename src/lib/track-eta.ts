/**
 * "Is this order late?" — answered from the promise the checkout made, not
 * from a feeling (post-purchase pass, 2026-10-06).
 *
 * A tracking page that says nothing while the promised window slips is the
 * single biggest source of "order kothay?" phone calls. This module works
 * out when the parcel was *promised*, so the page can say so out loud — and
 * it refuses to answer at all where no clock promise was ever made: the
 * courier zone is promised days, and a pickup order is collected by the
 * customer, not delivered.
 *
 * Pure — no clock reads inside except the injected `nowMs` (unit-tested).
 */

import { dynamicEta, isCourierZone } from "./delivery";
import { dhakaParts } from "./delivery-slots";
import type { Order } from "./orders";

/** Statuses where a parcel can still arrive — lateness only means something. */
export const MOVING_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "courier-assigned",
  "out-for-delivery",
] as const;

/** The cue rounds its promise up by 5 minutes; the promise is the same one. */
export const PROMISE_BUFFER_MINUTES = 5;

export interface TrackEta {
  /** Epoch ms the parcel was promised by — null when no clock was promised. */
  expectedAt: number | null;
  /** Whole minutes past the promise (0 when not late). */
  lateMinutes: number;
  late: boolean;
  /** Whole minutes still on the clock (0 once late). */
  minutesLeft: number;
}

const NO_PROMISE: TrackEta = {
  expectedAt: null,
  lateMinutes: 0,
  late: false,
  minutesLeft: 0,
};

/**
 * When the order was promised — null where the storefront never promised a
 * clock (courier zone, pickup, an order that has already landed).
 */
export const promisedAt = (order: Order): number | null => {
  if (!MOVING_STATUSES.includes(order.status as (typeof MOVING_STATUSES)[number])) {
    return null;
  }
  if (order.isPickup) return null;
  if (isCourierZone(order.zoneId)) return null;

  const startAt = order.scheduledAt ?? order.createdAt;
  if (!Number.isFinite(startAt)) return null;
  // The same ETA maths the checkout quoted, using the hour the order was
  // placed — a 9 PM order carries the night allowance it was promised with.
  const { minutes } = dynamicEta({ hour: dhakaParts(startAt).hour });
  return startAt + (minutes + PROMISE_BUFFER_MINUTES) * 60_000;
};

export const trackEta = (order: Order, nowMs: number = Date.now()): TrackEta => {
  const expectedAt = promisedAt(order);
  if (expectedAt === null) return NO_PROMISE;
  const diff = nowMs - expectedAt;
  return {
    expectedAt,
    late: diff > 0,
    lateMinutes: diff > 0 ? Math.max(1, Math.round(diff / 60_000)) : 0,
    minutesLeft: diff > 0 ? 0 : Math.max(0, Math.ceil(-diff / 60_000)),
  };
};
