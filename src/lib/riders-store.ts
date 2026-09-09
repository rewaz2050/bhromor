/**
 * Rider store (marketplace phase 3, slice 6) — demo, browser-local.
 *
 * Seeds show both halves of the staff queue: one pending application waiting
 * for verification and one approved rider. Live mode replaces this entirely
 * via /api/admin/riders; riders never appear on the storefront.
 */

import { DELIVERY_ZONES, type Rider } from "./catalog";

export const RIDERS_STORAGE_KEY = "prosanti.admin.riders.v1";

export const seedRiders = (): Rider[] => [
  {
    id: "rider-demo-applicant",
    name: "Tanvir Rahman",
    phone: "01811111111",
    contactEmail: "tanvir.applicant@example.com",
    vehicle: "bicycle",
    zoneIds: DELIVERY_ZONES.slice(0, 1).map((z) => z.id),
    status: "pending",
    isOnline: false,
    cashInHand: 0,
    ratingAvg: 0,
    ratingCount: 0,
  },
  {
    id: "rider-demo-courier",
    name: "Shirin Akter",
    phone: "01922222222",
    contactEmail: "shirin.courier@example.com",
    vehicle: "bike",
    zoneIds: DELIVERY_ZONES.map((z) => z.id),
    status: "active",
    isOnline: true,
    cashInHand: 0,
    ratingAvg: 0,
    ratingCount: 0,
  },
];

export const cloneRider = (r: Rider): Rider => ({
  ...r,
  zoneIds: [...r.zoneIds],
});

export const upsertRiderInList = (list: Rider[], rider: Rider): Rider[] => {
  const i = list.findIndex((r) => r.id === rider.id);
  if (i === -1) return [...list, cloneRider(rider)];
  const next = [...list];
  next[i] = cloneRider(rider);
  return next;
};

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: Rider[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): Rider[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(RIDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Rider[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → fall back to seeds
    }
  }
  cache = seedRiders();
  return cache;
};

const persist = (next: Rider[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RIDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeRiders = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let serverSnapshot: Rider[] | null = null;
export const getRidersServer = (): Rider[] => (serverSnapshot ??= seedRiders());

export const getRiders = (): Rider[] => ensureLoaded();

export const saveRiderInStore = (rider: Rider) =>
  persist(upsertRiderInList(ensureLoaded(), rider));

export const resetRiderStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(RIDERS_STORAGE_KEY);
  }
  persist(seedRiders());
};
