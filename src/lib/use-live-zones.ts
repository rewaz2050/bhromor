"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureLiveZones,
  getZonesSnapshot,
  isZonesSettled,
  subscribeLiveCatalog,
} from "./live-catalog";
import { useZones } from "./use-zones";

/**
 * Public delivery zones: live API rows when the backend serves them,
 * otherwise the shared demo store (which the admin zone manager edits).
 * Checkout and the delivery checker read through here.
 */
export function useLiveZones() {
  const demo = useZones();
  const live = useSyncExternalStore(
    subscribeLiveCatalog,
    getZonesSnapshot,
    () => null,
  );

  useEffect(() => {
    void ensureLiveZones();
  }, []);

  if (live) {
    return {
      zones: live,
      activeZones: live.filter((z) => z.active !== false),
      live: true as const,
      loading: !isZonesSettled(),
    };
  }
  return { ...demo, live: false as const, loading: false };
}
