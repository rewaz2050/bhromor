"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HOME_DEFAULTS, type HomeSettings } from "./home-cms";
import { sanitizeHomeSettings } from "./engagement";

/**
 * Storefront reader for the published homepage settings (§31).
 *
 * Audit 2026-09-17 P2.2: the homepage and the announcement bar used the
 * full `useCms()` editor hook, which (a) imported the staff-session probe →
 * admin API → Supabase browser client, so every visitor downloaded ~280 KB
 * of auth library they could never use, and (b) fetched /api/homepage once
 * PER consumer — two requests for the same row on every home load.
 *
 * This hook imports nothing staff-related and shares ONE fetch across all
 * consumers through a module store. `cache` is the browser default so the
 * CDN copy (`s-maxage=60`, P1.1) is honoured; the editor pushes a fresh
 * row into the store after a publish so staff see their change at once.
 */

type Listener = () => void;

let published: HomeSettings | null = null;
let promise: Promise<void> | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const fn of listeners) fn();
};

const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const snapshot = (): HomeSettings | null => published;
const serverSnapshot = (): HomeSettings | null => null;

/** Fetch-once (per page lifetime); concurrent mounts share the promise. */
export const ensureHomeSettings = (): Promise<void> => {
  if (promise) return promise;
  promise = (async () => {
    try {
      const res = await fetch("/api/homepage");
      if (!res.ok) throw new Error("CMS unavailable");
      const data = (await res.json()) as { settings?: HomeSettings };
      published = data.settings ? sanitizeHomeSettings(data.settings) : HOME_DEFAULTS;
    } catch {
      published = HOME_DEFAULTS;
    }
    notify();
  })();
  return promise;
};

/** Editor hook pushes the row it just published (skips a refetch). */
export const publishHomeSettings = (next: HomeSettings): void => {
  published = sanitizeHomeSettings(next);
  promise = Promise.resolve();
  notify();
};

/** Tests only. */
export const __resetHomeSettings = (): void => {
  published = null;
  promise = null;
  listeners.clear();
};

export function useHomeSettings(): {
  settings: HomeSettings;
  loading: boolean;
} {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    void ensureHomeSettings();
  }, []);
  return { settings: current ?? HOME_DEFAULTS, loading: current === null };
}
