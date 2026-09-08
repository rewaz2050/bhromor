/**
 * External notification store — seeds + persistence + unread sync.
 */

import { MOCK_ORDERS } from "./orders";
import {
  NOTIFS_STORAGE_KEY,
  markAllRead,
  markRead,
  type Notif,
} from "./notification-store";

const HOUR = 3_600_000;

export const seedNotifs = (): Notif[] => {
  const now = Date.now();
  const newest = MOCK_ORDERS[0];
  const out = MOCK_ORDERS.find((o) => o.status === "out-for-delivery");
  const delivered = MOCK_ORDERS.find((o) => o.status === "delivered");
  return [
    {
      id: "n1",
      kind: "order",
      title: "New order awaiting confirmation",
      body: `${newest.id} from ${newest.customer.name} (${newest.customer.area}) — ${(newest.total / 100).toLocaleString("en-IN")} taka, cash on delivery.`,
      at: now - 6 * 60_000,
      read: false,
      href: `/admin/orders/${newest.id}`,
    },
    {
      id: "n2",
      kind: "order",
      title: "Order out for delivery",
      body: out
        ? `${out.id} is on the road — rider assigned and moving.`
        : "All deliveries assigned.",
      at: now - 35 * 60_000,
      read: false,
      href: out ? `/admin/orders/${out.id}` : "/admin/orders",
    },
    {
      id: "n3",
      kind: "review",
      title: "Review awaiting moderation",
      body: "A customer review is waiting for approval in the moderation queue.",
      at: now - 2 * HOUR,
      read: false,
      href: "/admin/reviews",
    },
    {
      id: "n4",
      kind: "stock",
      title: "Low stock alert",
      body: "One or more products are at or below the low-stock threshold.",
      at: now - 5 * HOUR,
      read: true,
      href: "/admin/inventory",
    },
    {
      id: "n5",
      kind: "order",
      title: "Order delivered",
      body: delivered
        ? `${delivered.id} was delivered ${delivered.deliveredMinutes ?? ""} minutes after confirmation.`
        : "A delivery completed.",
      at: now - 9 * HOUR,
      read: true,
      href: delivered ? `/admin/orders/${delivered.id}` : "/admin/orders",
    },
    {
      id: "n6",
      kind: "system",
      title: "Weekly summary ready",
      body: "Sales, delivery performance and top products for the past 7 days.",
      at: now - 26 * HOUR,
      read: true,
    },
  ];
};

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: Notif[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): Notif[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(NOTIFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Notif[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → seeds
    }
  }
  cache = seedNotifs();
  return cache;
};

const persist = (next: Notif[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeNotifs = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getNotifs = (): Notif[] => ensureLoaded();

export const getNotifsServer = (): Notif[] => seedNotifs();

export const readNotif = (id: string) =>
  persist(markRead(ensureLoaded(), id));

export const readAllNotifs = () => persist(markAllRead(ensureLoaded()));

export const resetNotifs = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(NOTIFS_STORAGE_KEY);
  }
  persist(seedNotifs());
};
