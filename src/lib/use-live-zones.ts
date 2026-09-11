"use client";

import { useEffect, useState } from "react";
import { DELIVERY_ZONES, type DeliveryZone } from "./catalog";

/**
 * Public delivery zones — live only. Checkout and the delivery checker read
 * through here. Until the backend answers, the shipped launch zones serve as
 * the reference list (they are the same rows the seed script writes); once
 * GET /api/zones returns live rows, the hook swaps them in.
 */
export function useLiveZones() {
  const [liveZones, setLiveZones] = useState<DeliveryZone[] | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/zones", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { zones?: DeliveryZone[] };
        return data.zones ?? null;
      })
      .then((zones) => {
        if (cancelled) return;
        if (zones && zones.length > 0) setLiveZones(zones);
        setSettled(true);
      })
      .catch(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const zones = liveZones ?? DELIVERY_ZONES;
  const live = liveZones !== null;
  return {
    zones,
    activeZones: zones.filter((z) => z.active !== false),
    live,
    loading: !settled,
  };
}
