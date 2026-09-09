/**
 * Shop store (marketplace phase 2, slice 2) — demo, browser-local.
 *
 * Seeds mirror shop #1 from migration 004 ("PROSANTI Direct", active + open,
 * serving every seeded zone) so demo mode behaves like a one-shop platform.
 * Live mode replaces this entirely via /api/admin/shops (staff) and
 * /api/shops (public).
 */

import { DELIVERY_ZONES, type Shop } from "./catalog";

export const SHOPS_STORAGE_KEY = "prosanti.admin.shops.v1";

export const seedShops = (): Shop[] => [
  {
    id: "shop-demo-1",
    slug: "prosanti-direct",
    name: "PROSANTI Direct",
    tagline: "Everyday essentials, delivered in under an hour.",
    phone: "01700000000",
    contactEmail: "owner@prosanti.store",
    address: "House 1, Road 1, Dhaka",
    zoneIds: DELIVERY_ZONES.map((z) => z.id),
    prepMinutes: 15,
    commissionPct: 15,
    status: "active",
    isOpen: true,
    ratingAvg: 0,
    ratingCount: 0,
  },
];

export const cloneShop = (s: Shop): Shop => ({ ...s, zoneIds: [...s.zoneIds] });

export const upsertShopInList = (list: Shop[], shop: Shop): Shop[] => {
  const i = list.findIndex((s) => s.id === shop.id);
  if (i === -1) return [...list, cloneShop(shop)];
  const next = [...list];
  next[i] = cloneShop(shop);
  return next;
};

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: Shop[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): Shop[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SHOPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Shop[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → fall back to seeds
    }
  }
  cache = seedShops();
  return cache;
};

const persist = (next: Shop[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SHOPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeShops = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let serverSnapshot: Shop[] | null = null;
export const getShopsServer = (): Shop[] => (serverSnapshot ??= seedShops());

export const getShops = (): Shop[] => ensureLoaded();

export const saveShopInStore = (shop: Shop) =>
  persist(upsertShopInList(ensureLoaded(), shop));

export const resetShopStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SHOPS_STORAGE_KEY);
  }
  persist(seedShops());
};
