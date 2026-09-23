"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Product } from "./catalog";
import {
  getViewed,
  getViewedServer,
  recentlyViewedProducts,
  recordView,
  subscribeViewed,
} from "./recently-viewed";

/**
 * Recently viewed pieces resolved against the serving catalog. SSR-stable:
 * the server has no localStorage, so it renders nothing and the client
 * fills the rail after hydration (same pattern as the wishlist heart).
 */
export function useRecentlyViewed(
  products: Product[],
  opts: { exclude?: string; limit?: number } = {},
): Product[] {
  const entries = useSyncExternalStore(subscribeViewed, getViewed, getViewedServer);
  const { exclude, limit } = opts;
  return useMemo(
    () => recentlyViewedProducts(entries, products, { exclude, limit }),
    [entries, products, exclude, limit],
  );
}

/** The product page remembers the view once per product. */
export function useRecordView(productId: string): void {
  useEffect(() => {
    recordView(productId);
  }, [productId]);
}
