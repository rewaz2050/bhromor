/**
 * External coupon store — seeds + persistence, shared by the admin
 * manager and the public checkout. Sunamganj real promo codes.
 */

import { CATEGORIES } from "./catalog";
import {
  COUPONS_STORAGE_KEY,
  removeCoupon,
  upsertCoupon,
  type Coupon,
} from "./coupons";
import { bdt } from "./format";

export const seedCoupons = (): Coupon[] => {
  const now = Date.now();
  const DAY = 86_400_000;
  return [
    {
      id: "c1",
      code: "WELCOME100",
      type: "fixed",
      value: bdt(100),
      minOrder: bdt(1000),
      description: "Welcome offer — ৳100 off on ৳1000+",
      validUntil: now + 90 * DAY,
      usageLimit: 500,
      used: 42,
      active: true,
    },
    {
      id: "c2",
      code: "SUNAMGANJ15",
      type: "percent",
      value: 15,
      maxDiscount: bdt(500),
      minOrder: bdt(500),
      zoneId: "z1",
      description: "15% off up to ৳500 — Zone A Traffic Point (Boropara, Shologhar)",
      validUntil: now + 30 * DAY,
      usageLimit: 200,
      used: 17,
      active: true,
    },
    {
      id: "c3",
      code: "EID50",
      type: "fixed",
      value: bdt(50),
      minOrder: 0,
      categoryId: "men",
      description: "Eid — ৳50 off on Men",
      validUntil: now + 7 * DAY,
      used: 3,
      active: true,
    },
    {
      id: "c4",
      code: "FREEDELIVERY",
      type: "free_delivery",
      value: 0,
      minOrder: bdt(500),
      description: "Free delivery — Sunamganj Sadar any zone",
      validUntil: now + 14 * DAY,
      usageLimit: 100,
      used: 8,
      active: true,
    },
    {
      id: "c5",
      code: "BOROPARA20",
      type: "percent",
      value: 20,
      maxDiscount: bdt(300),
      minOrder: bdt(800),
      zoneId: "z1",
      categoryId: "men",
      description: "Boropara special — 20% off up to ৳300 on Men",
      validUntil: now + 10 * DAY,
      usageLimit: 50,
      used: 5,
      active: true,
    },
  ];
};

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: Coupon[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): Coupon[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(COUPONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Coupon[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → seeds
    }
  }
  cache = seedCoupons();
  return cache;
};

const persist = (next: Coupon[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COUPONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeCoupons = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCoupons = (): Coupon[] => ensureLoaded();

/**
 * Stable server snapshot for useSyncExternalStore — a fresh `seedCoupons()`
 * per call re-renders forever until React throws (\"The result of
 * getServerSnapshot should be cached\" → Next \"This page couldn't load\").
 */
let serverSnapshot: Coupon[] | null = null;
export const getCouponsServer = (): Coupon[] =>
  (serverSnapshot ??= seedCoupons());

export const saveCouponInStore = (coupon: Coupon) =>
  persist(upsertCoupon(ensureLoaded(), coupon));

export const deleteCouponInStore = (id: string) =>
  persist(removeCoupon(ensureLoaded(), id));

/** Mark one use when an order is placed with the code (§56 usage limit). */
export const recordCouponUseInStore = (code: string) => {
  const current = ensureLoaded();
  const target = current.find(
    (c) => c.code === code.trim().toUpperCase().replace(/\s+/g, ""),
  );
  if (!target) return;
  persist(
    current.map((c) => (c.id === target.id ? { ...c, used: c.used + 1 } : c)),
  );
};

export const resetCoupons = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(COUPONS_STORAGE_KEY);
  }
  persist(seedCoupons());
};

export const categoryNameOf = (id?: string): string | undefined =>
  id ? CATEGORIES.find((c) => c.id === id)?.name : undefined;
