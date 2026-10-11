"use client";

/**
 * Keep an open page honest (2026-10-11).
 *
 * Two customer screens used to read their data exactly once and then sit
 * still: the tracker said "Confirmed" for a whole delivery, and the account's
 * order list said the same until the shopper reloaded by hand. Both need the
 * same three things — a tick, a stop condition, and a pause while nobody is
 * looking — so they share this rather than each growing their own interval.
 *
 * `enabled` is the stop condition: callers pass "is something still moving",
 * so the polling ends by itself once there is nothing left to change. `onTick`
 * must be a stable callback (useCallback) — a fresh identity every render
 * would tear the interval down and restart it before it ever fired.
 */

import { useEffect } from "react";

export const useLiveRefresh = (
  enabled: boolean,
  ms: number,
  onTick: () => void,
): void => {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      // A phone left open on the tracker overnight should cost nothing.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      onTick();
    }, ms);
    return () => {
      window.clearInterval(id);
    };
  }, [enabled, ms, onTick]);
};
