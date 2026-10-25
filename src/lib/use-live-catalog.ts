"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureLiveCatalog,
  getCategoriesSnapshot,
  getLiveCategories,
  getProductsSnapshot,
  getShopsSnapshot,
  getCatalogStatusSnapshot,
  retryLiveCatalog,
  subscribeLiveCatalog,
} from "./live-catalog";

/**
 * Live-only storefront catalog. All consumers share data and readiness;
 * a cold or failed request never substitutes launch/demo product rows.
 */
export function useLiveCatalog() {
  const products = useSyncExternalStore(
    subscribeLiveCatalog,
    getProductsSnapshot,
    getProductsSnapshot,
  );
  const categories = useSyncExternalStore(
    subscribeLiveCatalog,
    getCategoriesSnapshot,
    getCategoriesSnapshot,
  );
  const shops = useSyncExternalStore(
    subscribeLiveCatalog,
    getShopsSnapshot,
    getShopsSnapshot,
  );
  const status = useSyncExternalStore(
    subscribeLiveCatalog,
    getCatalogStatusSnapshot,
    getCatalogStatusSnapshot,
  );

  useEffect(() => { void ensureLiveCatalog(); }, []);

  return {
    products,
    categories,
    shops,
    /** True once live rows (not seeds) are serving. */
    live: status === "ready",
    loading: status === "loading",
    retry: retryLiveCatalog,
    liveCategories: getLiveCategories(),
  };
}
