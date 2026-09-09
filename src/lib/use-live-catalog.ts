"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ensureLiveCatalog,
  getCategoriesSnapshot,
  getLiveCategories,
  getLiveProducts,
  getProductsSnapshot,
  getShopsSnapshot,
  isCatalogSettled,
  subscribeLiveCatalog,
} from "./live-catalog";

/**
 * Storefront catalog with live cutover. Seeds paint instantly (SSR-safe);
 * when the backend serves live rows the hook swaps them in once.
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
  const [live, setLive] = useState(() => getLiveProducts() !== null);
  const [settled, setSettled] = useState(() => isCatalogSettled());

  useEffect(() => {
    let cancelled = false;
    void ensureLiveCatalog().then((isLive) => {
      if (cancelled) return;
      setLive(isLive && getLiveProducts() !== null);
      setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    products,
    categories,
    shops,
    /** True once live rows (not seeds) are serving. */
    live: live && getLiveProducts() !== null,
    loading: !settled,
    liveCategories: getLiveCategories(),
  };
}
