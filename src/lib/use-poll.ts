"use client";

import { useEffect, useRef } from "react";

/**
 * Background refresh that respects the tab.
 *
 * Operator audit 2026-09-18: the admin list (10 s), the staff inbox (15 s)
 * and the rider job feed all kept polling while the tab was hidden — a
 * phone in a rider's pocket or a forgotten admin tab burned a request every
 * few seconds against the per-user rate limit, and a tab that came back
 * showed stale rows until the next tick.
 *
 * This hook:
 *   - ticks `fn` every `intervalMs` while the document is visible;
 *   - stops entirely while `document.visibilityState === "hidden"`;
 *   - refreshes immediately on `visibilitychange` → visible and on window
 *     `focus` (the moment the operator looks again), then resumes ticking.
 *
 * `fn` is read through a ref so callers may pass an inline closure without
 * re-arming the timer on every render. Not enabled → nothing runs.
 */
export function usePoll(
  fn: () => void | Promise<unknown>,
  intervalMs: number,
  enabled = true,
): void {
  const fnRef = useRef(fn);
  // Latest callback, committed after render (never mutate a ref in render).
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let timer: number | null = null;

    const tick = () => {
      void fnRef.current();
    };
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        tick();
        start();
      }
    };
    const onFocus = () => {
      if (document.visibilityState !== "hidden") tick();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs]);
}
