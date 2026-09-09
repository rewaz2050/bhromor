/**
 * Customer delivery zone (marketplace phase 2, slice 4).
 *
 * A persisted "deliver to" choice that drives zone-scoped discovery: the
 * shop browser, home sections and shop pages filter to shops serving it.
 * Null = no choice yet = everything orderable shows. Checkout pre-fills
 * from it and writes back whenever the customer picks a zone there.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";

export const MY_ZONE_KEY = "prosanti.myzone.v1";

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => {
  for (const l of listeners) l();
};

/** Primitives compare by value, so direct reads stay snapshot-stable. */
const readStored = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MY_ZONE_KEY);
    return raw && raw.trim() !== "" ? raw.trim().slice(0, 64) : null;
  } catch {
    return null;
  }
};

const subscribeMyZone = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getMyZoneSnapshot = (): string | null => readStored();
const getMyZoneServerSnapshot = (): string | null => null;

export function useMyZone() {
  const zoneId = useSyncExternalStore(
    subscribeMyZone,
    getMyZoneSnapshot,
    getMyZoneServerSnapshot,
  );

  const setZoneId = useCallback((next: string | null) => {
    const value =
      next && next.trim() !== "" ? next.trim().slice(0, 64) : null;
    if (typeof window !== "undefined") {
      try {
        if (value) window.localStorage.setItem(MY_ZONE_KEY, value);
        else window.localStorage.removeItem(MY_ZONE_KEY);
      } catch {
        // storage unavailable — zone stays for this render only
      }
    }
    notify();
  }, []);

  return { zoneId, setZoneId };
}
