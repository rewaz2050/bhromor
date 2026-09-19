/**
 * "What is the ONE thing to do with this order right now?" — shared by the
 * admin order list (row buttons), the admin detail page, and the vendor
 * pages, so every screen offers the same next tap for the same order.
 *
 * Pure module (unit-tested). The database status machine stays the judge;
 * this only decides which legal move is worth a button.
 */

import { ACTION_LABEL, type Order, type OrderStatus } from "./orders";
import { paymentSummary } from "./payment-labels";

export type ActorRole = "staff" | "vendor";

export type PrimaryAction =
  | {
      kind: "action";
      to: OrderStatus;
      label: string;
      /** History note sent with the transition (pickup hand-over). */
      note?: string;
      /** Ask before doing it (irreversible or money-related). */
      confirm?: string;
    }
  | {
      /** A legal move exists but something must happen first. */
      kind: "blocked";
      reason: string;
      /** Where the blocker is resolved (relative admin path). */
      href?: string;
    }
  | {
      /** Nothing for this actor to press — someone else owns the next step. */
      kind: "wait";
      reason: string;
    }
  | null;

type ActionOrder = Pick<
  Order,
  "id" | "status" | "payment" | "paymentStatus" | "isPickup" | "isReturn"
>;

export const PICKUP_HANDOVER_LABEL = "Handed to customer";
export const PICKUP_HANDOVER_NOTE = "Collected by the customer at Traffic Point";

/** Delivered / cancelled — nothing left to do. */
const isClosed = (status: OrderStatus): boolean =>
  status === "delivered" || status === "cancelled";

export const primaryAction = (
  order: ActionOrder,
  role: ActorRole = "staff",
): PrimaryAction => {
  if (isClosed(order.status)) return null;
  // Return legs move through the return decisions (approve / reject /
  // complete) on the admin detail page — never the normal flow buttons.
  if (order.isReturn) {
    return role === "staff"
      ? { kind: "wait", reason: "Return leg — decide it on the order page." }
      : { kind: "wait", reason: "Return leg — handled by PROSANTI staff." };
  }
  const pay = paymentSummary(order);

  if (order.status === "pending") {
    return { kind: "action", to: "confirmed", label: ACTION_LABEL.confirmed };
  }

  if (order.status === "confirmed" || order.status === "preparing") {
    if (pay.awaitingVerification) {
      // ps_advance_order refuses 'ready-for-pickup' while a wallet payment is
      // unverified — offer the verification, not a button that will fail.
      return role === "staff"
        ? {
            kind: "blocked",
            reason: `Verify the ${pay.wallet} payment first`,
            href: `/admin/orders/${order.id}`,
          }
        : {
            kind: "blocked",
            reason: `Verify the ${pay.wallet} payment first (payment card below)`,
          };
    }
    return {
      kind: "action",
      to: "ready-for-pickup",
      label: order.isPickup ? "Ready — customer can collect" : ACTION_LABEL["ready-for-pickup"],
    };
  }

  // ready-for-pickup / courier-assigned / out-for-delivery
  if (order.isPickup) {
    // A counter pickup never meets a rider: staff closes it when the
    // customer collects (the server walks the rider states internally).
    return role === "staff"
      ? {
          kind: "action",
          to: "delivered",
          label: PICKUP_HANDOVER_LABEL,
          note: PICKUP_HANDOVER_NOTE,
          confirm: `Customer collected order ${order.id} at Traffic Point?`,
        }
      : {
          kind: "wait",
          reason: "Customer collects at the counter — PROSANTI staff marks it handed over.",
        };
  }
  return {
    kind: "wait",
    reason:
      order.status === "ready-for-pickup"
        ? "Waiting for a rider"
        : order.status === "courier-assigned"
          ? "Rider is coming to the shop"
          : "Rider is on the way to the customer",
  };
};

/** Cancel is a secondary action — only where the database allows it. */
export const canQuickCancel = (order: ActionOrder): boolean =>
  !order.isReturn &&
  (order.status === "pending" ||
    order.status === "confirmed" ||
    order.status === "preparing");

/**
 * Minutes since placement, whole numbers. `now` is injected so render code
 * can pass `useNow()` and tests can pin the clock.
 */
export const ageMinutes = (createdAt: number, now: number): number =>
  Math.max(0, Math.floor((now - createdAt) / 60_000));

/** "just now" · "7 min" · "1 h 12 min" · "2 d". */
export const ageLabel = (createdAt: number, now: number): string => {
  const min = ageMinutes(createdAt, now);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d`;
};

/** Oldest open order of the given statuses (the one to look at first). */
export const oldestOf = (
  orders: readonly Pick<Order, "status" | "createdAt">[],
  statuses: readonly OrderStatus[],
): number | null => {
  let oldest: number | null = null;
  for (const o of orders) {
    if (!statuses.includes(o.status)) continue;
    if (oldest === null || o.createdAt < oldest) oldest = o.createdAt;
  }
  return oldest;
};
