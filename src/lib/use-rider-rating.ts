"use client";

/** The rider's own rating breakdown (202609250008). Decoration: errors stay silent. */
import { useEffect, useState } from "react";
import { riderFetch } from "./use-rider";
import type { RatingSummary } from "./rider-rating";

export function useRiderRating(enabled: boolean) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    riderFetch<{ ready: boolean; summary: RatingSummary | null }>("/api/rider/ratings")
      .then((d) => {
        if (!cancelled) setSummary(d.summary);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { summary, loading };
}
