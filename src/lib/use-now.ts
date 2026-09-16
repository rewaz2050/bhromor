"use client";

import { useSyncExternalStore } from "react";

/**
 * Wall-clock for render, without calling `Date.now()` during render.
 *
 * React's purity rule flags `Date.now()` in render because the server and
 * the client then paint different HTML (hydration mismatch) and the value
 * never refreshes. This hook exposes the clock as an external store that
 * ticks every `intervalMs`; the server snapshot is a fixed epoch so SSR
 * output is deterministic, and the first client render replaces it.
 */
const listeners = new Map<number, Set<() => void>>();
const timers = new Map<number, number>();
const ticks = new Map<number, number>();

const subscribe = (intervalMs: number) => (onChange: () => void) => {
  let set = listeners.get(intervalMs);
  if (!set) {
    set = new Set();
    listeners.set(intervalMs, set);
  }
  set.add(onChange);
  if (!timers.has(intervalMs)) {
    ticks.set(intervalMs, Date.now());
    timers.set(
      intervalMs,
      window.setInterval(() => {
        ticks.set(intervalMs, Date.now());
        listeners.get(intervalMs)?.forEach((fn) => fn());
      }, intervalMs),
    );
  }
  return () => {
    set?.delete(onChange);
    if (set && set.size === 0) {
      const id = timers.get(intervalMs);
      if (id !== undefined) window.clearInterval(id);
      timers.delete(intervalMs);
      listeners.delete(intervalMs);
    }
  };
};

const subscribers = new Map<number, ReturnType<typeof subscribe>>();
const subscriberFor = (intervalMs: number) => {
  let fn = subscribers.get(intervalMs);
  if (!fn) {
    fn = subscribe(intervalMs);
    subscribers.set(intervalMs, fn);
  }
  return fn;
};

/** Deterministic server snapshot (2026-01-01T00:00:00Z). */
export const SERVER_NOW = Date.UTC(2026, 0, 1);

export function useNow(intervalMs = 60_000): number {
  return useSyncExternalStore(
    subscriberFor(intervalMs),
    () => ticks.get(intervalMs) ?? Date.now(),
    () => SERVER_NOW,
  );
}
