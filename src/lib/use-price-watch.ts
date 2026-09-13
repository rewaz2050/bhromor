"use client";

/**
 * Price memory + alerts for the storefront (P0 #5).
 *
 * Two hooks over the same device-local store: `usePriceDrops` scans a list and
 * returns what got cheaper since THIS device last saw it, `usePriceAlert` is the
 * "tell me when it drops" toggle on a product page. Both are stable under SSR —
 * the server has no localStorage, so it renders the no-drop state and the
 * client upgrades after hydration (same pattern as the wishlist heart).
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Product } from "./catalog";
import {
  dropFor,
  dropsFor,
  getPriceSnapshots,
  getPriceSnapshotsServer,
  getAlerts,
  getAlertsServer,
  recordPrice,
  subscribePriceWatch,
  togglePriceAlert,
  type PriceDrop,
} from "./price-drop";

export function usePriceDrops(products: Product[]): Map<string, PriceDrop> {
  const snapshots = useSyncExternalStore(
    subscribePriceWatch,
    getPriceSnapshots,
    getPriceSnapshotsServer,
  );
  return useMemo(() => dropsFor(products, snapshots), [products, snapshots]);
}

/** Remembering the price the shopper is looking at is what makes tomorrow's
 *  "it dropped" honest — so it happens on render of a priced surface, once. */
export function usePriceMemory(product: Product): void {
  useEffect(() => {
    // An unacknowledged drop is kept: overwriting the memory on the next paint
    // would make "it got cheaper" exist for a single frame, which is worse than
    // not showing it. The shopper clears it with "Got it" (or the price moves).
    const seen = getPriceSnapshots()[product.id];
    if (seen && seen.price > product.price) return;
    recordPrice(product.id, product.price);
  }, [product.id, product.price]);
}

/** The one-line answer a product page or card needs: did this get cheaper? */
export function usePriceDropFor(product: Product): PriceDrop | null {
  const snapshots = useSyncExternalStore(
    subscribePriceWatch,
    getPriceSnapshots,
    getPriceSnapshotsServer,
  );
  return useMemo(() => dropFor(product, snapshots), [product, snapshots]);
}

export function usePriceAlert(product: Product): {
  watching: boolean;
  toggle: () => boolean;
  drop: PriceDrop | null;
} {
  const snapshots = useSyncExternalStore(
    subscribePriceWatch,
    getPriceSnapshots,
    getPriceSnapshotsServer,
  );
  const alerts = useSyncExternalStore(subscribePriceWatch, getAlerts, getAlertsServer);
  const watching = alerts.includes(product.id);
  return {
    watching,
    toggle: () => togglePriceAlert(product.id),
    drop: dropFor(product, snapshots),
  };
}
