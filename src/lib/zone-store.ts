/**
 * Delivery zone helpers (§20–21) — pure, client-safe.
 *
 * The public checkout and the admin zone manager share these list helpers;
 * zone rows themselves live in the database (see /api/zones and
 * /api/admin/zones).
 */

import type { DeliveryZone } from "./catalog";

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
