/**
 * External order store for the admin demo — feeds useSyncExternalStore so
 * hydration is safe and mutations never trigger effect cascades.
 *
 * Reads seed data (src/lib/orders.ts) and overlays browser-local changes so
 * status advances survive navigation. Swapped for Supabase reads/writes in
 * the backend phase — components only ever talk to this store.
 */

import {
  MOCK_ORDERS,
  ORDERS_STORAGE_KEY,
  advanceOrder,
  type Order,
  type OrderStatus,
} from "./orders";

type Listener = () => void;

let cache: Order[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

/** Lazily initialise from localStorage (client) or seed data (server). */
const ensureLoaded = (): Order[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window === "undefined") {
    cache = MOCK_ORDERS;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Order[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // corrupted storage → fall back to seed data
  }
  cache = MOCK_ORDERS;
  return cache;
};

const persist = (next: Order[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeOrders = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getOrders = (): Order[] => ensureLoaded();

export const advanceOrderInStore = (
  id: string,
  to: OrderStatus,
  note?: string,
): boolean => {
  const current = ensureLoaded();
  let changed = false;
  const next = current.map((o) => {
    if (o.id !== id) return o;
    const advanced = advanceOrder(o, to, Date.now(), note);
    if (!advanced) return o;
    changed = true;
    return advanced;
  });
  // `.map()` always returns a new array, so the old `next !== current` check
  // was always true: illegal transitions still wrote to storage and woke
  // every subscriber.
  if (changed) persist(next);
  return changed;
};

/** Append a freshly placed checkout order (newest first). */
export const addOrderToStore = (order: Order) => {
  const current = ensureLoaded();
  persist([order, ...current]);
};

export const resetOrderStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ORDERS_STORAGE_KEY);
  }
  persist(MOCK_ORDERS);
};
