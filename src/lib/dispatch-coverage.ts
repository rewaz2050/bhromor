/**
 * Item S (2026-10-02) — "why is this order not moving?" for the dispatch board.
 *
 * The board listed orders waiting for a rider but never said WHY one had no
 * offers: an unverified wallet payment, no rider covering the zone at all,
 * every covering rider offline / off shift / at the cash cap / at the 2-job
 * limit — or offers that simply nobody took. An order silently waiting with no
 * coverage is the worst delivery failure (the customer just waits), so the
 * board now names the cause and counts the ones that need a human.
 *
 * Pure: mirrors the eligibility gates of the dispatch SQL (active, online,
 * in zone, on shift, under the cash cap, under the load limit). It is advice
 * for staff, never an input to dispatch itself.
 */

import type { Rider } from "./catalog";
import type { Order } from "./orders";
import { isOnShift } from "./rider-hours";
import { DISPATCH_DEFAULTS, DISPATCH_LOAD_LIMIT } from "./dispatch-settings";

export type CoverageReason =
  | "payment" // wallet payment not verified yet — dispatch correctly waits
  | "orphan" // status says a rider has it, but no live assignment exists
  | "no-rider-in-zone" // nobody is assigned to this zone at all
  | "all-offline"
  | "off-shift"
  | "cash-capped"
  | "at-capacity"
  | "no-takers" // eligible riders exist and offers went out, nobody accepted
  | "pending-offers"; // eligible riders exist; offers are about to go / just went out

export type CoverageSeverity = "info" | "warn" | "alert";

export interface Coverage {
  reason: CoverageReason;
  severity: CoverageSeverity;
  /** One line for staff. */
  label: string;
  /** What to do about it. */
  action: string;
  /** Riders assigned to the zone / of those online / fully eligible. */
  covering: number;
  online: number;
  eligible: number;
  /** Minutes the order has waited since it became dispatchable. */
  waitingMin: number;
}

/** Waiting longer than this with eligible riders means the offers were ignored. */
export const NO_TAKERS_AFTER_MIN = 6;

const readyAt = (order: Order): number => {
  for (let i = order.timeline.length - 1; i >= 0; i -= 1) {
    if (order.timeline[i].status === "ready-for-pickup") return order.timeline[i].at;
  }
  return order.createdAt;
};

export interface CoverageOptions {
  cashCap?: number;
  loadLimit?: number;
  nowMs?: number;
  /** The order's wallet payment is not verified (dispatch waits for it). */
  awaitingVerification?: boolean;
  /** An offered/accepted/picked-up assignment exists for this order. */
  hasLiveAssignment?: boolean;
}

export const diagnoseCoverage = (
  order: Pick<Order, "zoneId" | "zoneName" | "status" | "timeline" | "createdAt">,
  riders: readonly Rider[],
  opts: CoverageOptions = {},
): Coverage => {
  const now = opts.nowMs ?? Date.now();
  const cap = opts.cashCap ?? DISPATCH_DEFAULTS.cashCap;
  const load = opts.loadLimit ?? DISPATCH_LOAD_LIMIT;
  const waitingMin = Math.max(0, Math.round((now - readyAt(order as Order)) / 60_000));

  const covering = riders.filter((r) => r.status === "active" && r.zoneIds.includes(order.zoneId));
  const online = covering.filter((r) => r.isOnline);
  const onShift = online.filter((r) => isOnShift(r.availability, now));
  const underCap = onShift.filter((r) => (r.cashInHand ?? 0) < cap);
  const eligible = underCap.filter((r) => (r.currentLoad ?? 0) < load);
  const counts = { covering: covering.length, online: online.length, eligible: eligible.length, waitingMin };

  if (opts.awaitingVerification) {
    return {
      ...counts,
      reason: "payment",
      severity: "info",
      label: "Waiting for the wallet payment to be verified",
      action: "Verify the payment — dispatch starts automatically after.",
    };
  }
  if (order.status !== "ready-for-pickup" && opts.hasLiveAssignment === false) {
    return {
      ...counts,
      reason: "orphan",
      severity: "alert",
      label: `Status says “${order.status.replace(/-/g, " ")}” but no rider holds this order`,
      action: "Open the order and redispatch it (or fix the status).",
    };
  }
  if (covering.length === 0) {
    return {
      ...counts,
      reason: "no-rider-in-zone",
      severity: "alert",
      label: `No active rider covers ${order.zoneName}`,
      action: "Add this zone to a rider (Riders), or assign a rider by hand below.",
    };
  }
  if (online.length === 0) {
    return {
      ...counts,
      reason: "all-offline",
      severity: "alert",
      label: `${covering.length} rider(s) cover ${order.zoneName}, all offline`,
      action: "Call a covering rider to go online, or assign by hand.",
    };
  }
  if (onShift.length === 0) {
    return {
      ...counts,
      reason: "off-shift",
      severity: "alert",
      label: `${online.length} rider(s) online, all outside their shift hours`,
      action: "Ask a rider to widen their shift, or assign by hand.",
    };
  }
  if (underCap.length === 0) {
    return {
      ...counts,
      reason: "cash-capped",
      severity: "alert",
      label: `${onShift.length} rider(s) available but all at the cash limit`,
      action: "Collect a rider's cash (Riders → settle), or raise the limit in Dispatch rules.",
    };
  }
  if (eligible.length === 0) {
    return {
      ...counts,
      reason: "at-capacity",
      severity: "warn",
      label: `${underCap.length} rider(s) available but all carrying ${load} jobs`,
      action: "It goes out as soon as one finishes a delivery; assign by hand if urgent.",
    };
  }
  if (waitingMin >= NO_TAKERS_AFTER_MIN) {
    return {
      ...counts,
      reason: "no-takers",
      severity: "warn",
      label: `${eligible.length} eligible rider(s) but nobody accepted for ${waitingMin} min`,
      action: "Phone one of them, or assign by hand.",
    };
  }
  return {
    ...counts,
    reason: "pending-offers",
    severity: "info",
    label: `${eligible.length} eligible rider(s) — offers are going out`,
    action: "Nothing to do; first to accept wins.",
  };
};

/** How many waiting orders need a human (alert) / a look (warn). */
export const coverageSummary = (items: readonly Coverage[]): { alert: number; warn: number } => ({
  alert: items.filter((c) => c.severity === "alert").length,
  warn: items.filter((c) => c.severity === "warn").length,
});
