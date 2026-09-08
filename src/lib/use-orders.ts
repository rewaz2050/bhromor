"use client";

/**
 * React binding for the admin order store (see order-store.ts).
 * `orders` updates automatically on every store mutation via
 * useSyncExternalStore — safe for SSR, hydration, and navigation.
 */

import { useSyncExternalStore } from "react";
import {
  advanceOrderInStore,
  getOrders,
  resetOrderStore,
  subscribeOrders,
} from "./order-store";
import type { OrderStatus } from "./orders";

export function useOrders() {
  const orders = useSyncExternalStore(subscribeOrders, getOrders, getOrders);

  return {
    orders,
    advance: (id: string, to: OrderStatus, note?: string) =>
      advanceOrderInStore(id, to, note),
    cancel: (id: string) => advanceOrderInStore(id, "cancelled"),
    reset: resetOrderStore,
  };
}
