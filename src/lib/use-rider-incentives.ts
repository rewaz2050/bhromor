"use client";

/** The rider's bonus picture (item V). Decoration: errors stay silent. */
import { useEffect, useState } from "react";
import { riderFetch } from "./use-rider";
import type { RiderIncentiveView } from "./rider-incentives";

export function useRiderIncentives(enabled: boolean) {
  const [view, setView] = useState<RiderIncentiveView | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    riderFetch<{ ready: boolean; view: RiderIncentiveView | null }>("/api/rider/incentives")
      .then((d) => {
        if (!cancelled) setView(d.view);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { view, loading };
}
