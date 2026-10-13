/**
 * One rule for "is this parcel still moving" (2026-10-13).
 *
 * It lived inside `components/account/order-history.tsx`, which was fine
 * while that component was the only caller. The home page needs the same
 * answer — a returning shopper's live order belongs at the top of the shop
 * front — and importing a whole client component to ask a one-line question
 * would have dragged the account history into the home page's bundle.
 *
 * So the rule moved here, and order-history re-exports it: both screens read
 * one definition, and neither can drift into calling an active order
 * finished.
 */

import type { OrderStatus } from "./orders";

/** Still somewhere between the shop and the doorstep. */
export const isOrderActive = (status: OrderStatus): boolean =>
  status !== "delivered" && status !== "cancelled";
