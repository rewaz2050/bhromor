/**
 * Delivery zone store (§20–21) — demo, browser-local.
 *
 * The public checkout and the admin zone manager share this store, so an
 * admin's zone edits (charge, ETA, covered areas, active state) are what the
 * customer sees when they pick a delivery area. Seeds come from
 * src/lib/catalog.ts; overrides persist under one localStorage key.
 */

import { DELIVERY_ZONES, type DeliveryZone } from "./catalog";

export const ZONES_STORAGE_KEY = "prosanti.admin.zones.v1";

export const cloneZone = (z: DeliveryZone): DeliveryZone => ({
  ...z,
  areas: [...z.areas],
});

export const upsertZone = (
  list: DeliveryZone[],
  zone: DeliveryZone,
): DeliveryZone[] => {
  const i = list.findIndex((z) => z.id === zone.id);
  if (i === -1) return [...list, cloneZone(zone)];
  const next = [...list];
  next[i] = cloneZone(zone);
  return next;
};

export const nextZoneId = (list: DeliveryZone[]): string => {
  const max = list.reduce((m, z) => {
    const n = Number(z.id.replace(/^\D+/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `z${max + 1}`;
};

export const moveZone = (
  list: DeliveryZone[],
  id: string,
  dir: -1 | 1,
): DeliveryZone[] => {
  const i = list.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: DeliveryZone[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const seedZones = (): DeliveryZone[] => DELIVERY_ZONES.map(cloneZone);

const ensureLoaded = (): DeliveryZone[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ZONES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeliveryZone[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → fall back to seeds
    }
  }
  cache = seedZones();
  return cache;
};

const persist = (next: DeliveryZone[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeZones = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Server-safe initial snapshot = the seed zones.
 *
 * MUST be a stable reference: useSyncExternalStore compares snapshots by
 * identity, and returning a fresh array on every call made React re-render
 * forever ("The result of getServerSnapshot should be cached").
 */
let serverSnapshot: DeliveryZone[] | null = null;
export const getZonesServer = (): DeliveryZone[] =>
  (serverSnapshot ??= seedZones());

export const getZones = (): DeliveryZone[] => ensureLoaded();

export const saveZoneInStore = (zone: DeliveryZone) =>
  persist(upsertZone(ensureLoaded(), zone));

export const removeZoneInStore = (id: string): boolean => {
  const current = ensureLoaded();
  if (current.length <= 1) return false; // keep at least one checkout zone
  persist(current.filter((z) => z.id !== id));
  return true;
};

export const moveZoneInStore = (id: string, dir: -1 | 1) =>
  persist(moveZone(ensureLoaded(), id, dir));

export const resetZoneStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ZONES_STORAGE_KEY);
  }
  persist(seedZones());
};
