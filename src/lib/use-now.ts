"use client";

import { useSyncExternalStore } from "react";

/**
 * Wall-clock for render, without letting the server and the client disagree.
 *
 * The previous version answered hydration with a FIXED epoch (2026-01-01):
 * server HTML was rendered against a date nine months in the past, and the
 * first client render — one frame later — replaced every countdown, every
 * "৪ মিনিট আগে" and every delivery slot with the real time. That is the
 * flicker people see on load: the page settles, then twitches.
 *
 * Now both sides read the SAME aligned clock:
 *
 *  • the value is floored to the interval (`alignedNow`), so a server render
 *    at 10:00:59 and a hydration at 10:01:01 of a 60 s clock both answer
 *    10:01:00 — the usual case matches exactly, with no hydration repair and
 *    no visible swap;
 *  • the server still answers with a real time, so the first paint already
 *    carries truthful numbers (a countdown is not "0 seconds" for a frame);
 *  • after mount the shared ticker takes over, one `setInterval` per
 *    interval, shared by every consumer (a page with six countdowns still
 *    runs one timer).
 *
 * Pure (unit-tested).
 */

const listeners = new Map<number, Set<() => void>>();
const timers = new Map<number, number>();
const ticks = new Map<number, number>();

/**
 * The clock's answer at `at`: the start of the interval it falls in.
 * Flooring is what makes a server render and a hydration agree.
 */
export const alignedNow = (intervalMs: number, at: number = Date.now()): number =>
  intervalMs > 0 ? Math.floor(at / intervalMs) * intervalMs : at;

const subscribe = (intervalMs: number) => (onChange: () => void) => {
  let set = listeners.get(intervalMs);
  if (!set) {
    set = new Set();
    listeners.set(intervalMs, set);
  }
  set.add(onChange);
  if (!timers.has(intervalMs)) {
    // Start on the interval boundary, not on the raw mount time: the first
    // tick then lands when the next interval begins, so a countdown does not
    // jump twice in its first second.
    ticks.set(intervalMs, alignedNow(intervalMs));
    timers.set(
      intervalMs,
      window.setInterval(() => {
        ticks.set(intervalMs, alignedNow(intervalMs));
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

const snapshotFor = (intervalMs: number) => (): number =>
  ticks.get(intervalMs) ?? alignedNow(intervalMs);

const serverSnapshotFor = (intervalMs: number) => (): number =>
  alignedNow(intervalMs);

const subscribers = new Map<number, ReturnType<typeof subscribe>>();
const subscriberFor = (intervalMs: number) => {
  let fn = subscribers.get(intervalMs);
  if (!fn) {
    fn = subscribe(intervalMs);
    subscribers.set(intervalMs, fn);
  }
  return fn;
};

const snapshots = new Map<number, () => number>();
const cachedSnapshotFor = (intervalMs: number) => {
  let fn = snapshots.get(intervalMs);
  if (!fn) {
    fn = snapshotFor(intervalMs);
    snapshots.set(intervalMs, fn);
  }
  return fn;
};

const serverSnapshots = new Map<number, () => number>();
const cachedServerSnapshotFor = (intervalMs: number) => {
  let fn = serverSnapshots.get(intervalMs);
  if (!fn) {
    fn = serverSnapshotFor(intervalMs);
    serverSnapshots.set(intervalMs, fn);
  }
  return fn;
};

export function useNow(intervalMs = 60_000): number {
  return useSyncExternalStore(
    subscriberFor(intervalMs),
    cachedSnapshotFor(intervalMs),
    cachedServerSnapshotFor(intervalMs),
  );
}
