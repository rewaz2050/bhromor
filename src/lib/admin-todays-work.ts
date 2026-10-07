/**
 * "Today's work" — the admin dashboard's action queue (ops pass 2026-10-06).
 *
 * The dashboard already had the numbers, scattered: four KPI cards, a wallet
 * banner, an SLA list, a low-stock panel. What it did not have was the
 * answer to the only question the person on shift asks when they open the
 * tab: *what needs me right now, and how long has it been waiting?*
 *
 * One row per queue, each row a link to that queue. Rows with nothing in
 * them stay away, so a quiet day reads "nothing is waiting" instead of a
 * wall of zeros. Pure module — no hooks, no fetching (unit-tested).
 */

import { ageLabel } from "./order-actions";

/** Same thresholds the SLA alerts use: a new order should move in 15 min. */
export const ACTION_SLA_MS = 15 * 60_000;
/** A packed parcel should not sit at the shop for half an hour. */
export const RIDER_SLA_MS = 30 * 60_000;

export interface TodaysWorkInput {
  now: number;
  /** pending + confirmed + preparing — the orders waiting on the shop. */
  actionOrders: number;
  /** createdAt of the oldest of those orders. */
  oldestActionAt: number | null;
  /** bKash / Nagad payments waiting for staff verification. */
  walletPending: number;
  /** ready-for-pickup + courier-assigned. */
  waitingRider: number;
  oldestRiderAt: number | null;
  /** Pieces at or under the low-stock threshold, still on sale. */
  lowStock: number;
  /** Reviews waiting for moderation. */
  reviewsPending: number;
}

export interface WorkItem {
  id: string;
  label: string;
  /** How long the oldest one has waited, or what the queue needs. */
  detail: string;
  href: string;
  count: number;
  /** Past its SLA — the row asks for attention, not just a click. */
  urgent: boolean;
  tone: "default" | "money";
}

const waiting = (oldestAt: number | null, now: number): string =>
  oldestAt === null ? "" : `oldest waiting ${ageLabel(oldestAt, now)}`;

export function buildTodaysWork(input: TodaysWorkInput): WorkItem[] {
  const rows: WorkItem[] = [];

  if (input.actionOrders > 0) {
    rows.push({
      id: "orders",
      label: "Orders need your tap",
      detail:
        waiting(input.oldestActionAt, input.now) ||
        "confirm, pack or hand them over",
      href: "/admin/orders?status=action",
      count: input.actionOrders,
      urgent:
        input.oldestActionAt !== null &&
        input.now - input.oldestActionAt > ACTION_SLA_MS,
      tone: "default",
    });
  }

  if (input.walletPending > 0) {
    rows.push({
      id: "wallet",
      label: "bKash / Nagad to verify",
      detail: "match the TrxID in the wallet, then verify or reject",
      href: "/admin/orders?status=action",
      count: input.walletPending,
      urgent: false,
      tone: "money",
    });
  }

  if (input.waitingRider > 0) {
    rows.push({
      id: "rider",
      label: "Parcels waiting for a rider",
      detail:
        waiting(input.oldestRiderAt, input.now) || "assign a rider or hand over",
      href: "/admin/deliveries",
      count: input.waitingRider,
      urgent:
        input.oldestRiderAt !== null &&
        input.now - input.oldestRiderAt > RIDER_SLA_MS,
      tone: "default",
    });
  }

  if (input.lowStock > 0) {
    rows.push({
      id: "stock",
      label: "Pieces low on stock",
      detail: "restock or hide them before they sell out",
      href: "/admin/inventory",
      count: input.lowStock,
      urgent: false,
      tone: "default",
    });
  }

  if (input.reviewsPending > 0) {
    rows.push({
      id: "reviews",
      label: "Reviews to moderate",
      detail: "approved reviews are the only ones the storefront shows",
      href: "/admin/reviews",
      count: input.reviewsPending,
      urgent: false,
      tone: "default",
    });
  }

  // Urgent first; otherwise the queue order above (people before paper).
  return rows.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
