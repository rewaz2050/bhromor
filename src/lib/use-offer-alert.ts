"use client";

/**
 * New-offer alert. A rider with the app open in a pocket needs more than a
 * card appearing: when an offer that was not on the board before arrives, the
 * phone vibrates and the tab title flashes the count until the offers are
 * answered. The first board load never alerts (those offers are not "new").
 */
import { useEffect, useRef } from "react";

export const newOfferIds = (seen: ReadonlySet<string>, offerIds: readonly string[]): string[] =>
  offerIds.filter((id) => !seen.has(id));

export const offerTitle = (count: number, base: string): string =>
  count > 0 ? `🔔 (${count}) নতুন অফার — ${base}` : base;

export function useOfferAlert(offerIds: string[], onNew?: (count: number) => void): void {
  const seen = useRef<Set<string> | null>(null);
  const baseTitle = useRef<string | null>(null);
  const key = offerIds.join("|");

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    if (seen.current === null) {
      // First board load: remember, never alert.
      seen.current = new Set(ids);
      return;
    }
    const fresh = newOfferIds(seen.current, ids);
    for (const id of ids) seen.current.add(id);
    if (fresh.length > 0) {
      try {
        navigator.vibrate?.([220, 110, 220, 110, 400]);
      } catch {
        /* vibration is a nicety */
      }
      onNew?.(fresh.length);
    }
  }, [key, onNew]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (baseTitle.current === null) baseTitle.current = document.title;
    const count = key ? key.split("|").length : 0;
    document.title = offerTitle(count, baseTitle.current);
    return () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    };
  }, [key]);
}
