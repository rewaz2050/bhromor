"use client";

/**
 * React binding for the delivery-zone store. Used by BOTH the public
 * checkout (so admin edits reach customers) and the admin zone manager.
 */

import { useSyncExternalStore } from "react";
import {
  getZones,
  getZonesServer,
  moveZoneInStore,
  removeZoneInStore,
  resetZoneStore,
  saveZoneInStore,
  subscribeZones,
} from "./zone-store";
import type { DeliveryZone } from "./catalog";

export function useZones() {
  const zones = useSyncExternalStore(subscribeZones, getZones, getZonesServer);

  return {
    /** Zones customers can check out with (active by default). */
    activeZones: zones.filter((z) => z.active !== false),
    zones,
    saveZone: (z: DeliveryZone) => saveZoneInStore(z),
    removeZone: (id: string): boolean => removeZoneInStore(id),
    moveZone: (id: string, dir: -1 | 1) => moveZoneInStore(id, dir),
    reset: resetZoneStore,
  };
}
