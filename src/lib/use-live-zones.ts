"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DELIVERY_ZONES, type DeliveryZone } from "./catalog";
import {
  ensureLiveZones,
  getZonesSnapshot,
  isZonesSettled,
  subscribeLiveCatalog,
} from "./live-catalog";

/**
 * Public delivery zones — one shared read, live only.
 *
 * This hook used to keep its own `useState` and fetch `/api/zones` in every
 * consumer: the header's area pill, the home delivery check, checkout's zone
 * list, the two apply forms and the vendor's settings page each fired their
 * OWN request on every page, and each one flashed the shipped fallback rows
 * before its copy answered (fix-all pass 2026-10-07). Zones now live in the
 * same module store as the catalog — one request per page session, shared by
 * everybody, and a page revisited a second later paints from memory.
 *
 * Until the backend answers, the shipped launch zones serve as the reference
 * list (they are the same rows the seed writes); live rows replace them.
 */
export function useLiveZones() {
  const rows = useSyncExternalStore(
    subscribeLiveCatalog,
    getZonesSnapshot,
    getZonesSnapshot,
  );
  const [settled, setSettled] = useState(() => isZonesSettled());

  useEffect(() => {
    let cancelled = false;
    void ensureLiveZones().then(() => {
      if (cancelled) return;
      setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const zones: DeliveryZone[] = rows.length > 0 ? rows : DELIVERY_ZONES;
  return {
    zones,
    activeZones: zones.filter((z) => z.active !== false),
    live: rows.length > 0,
    loading: !settled,
  };
}
