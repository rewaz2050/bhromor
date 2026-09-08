"use client";

/**
 * React binding for the admin catalog store (see catalog-store.ts).
 * Hydration-safe via useSyncExternalStore.
 */

import { useSyncExternalStore } from "react";
import {
  getCatalog,
  moveCategoryInStore,
  resetCatalogStore,
  saveCategoryInStore,
  saveProductInStore,
  setCategoryActiveInStore,
  setProductActiveInStore,
  toggleProductFlagInStore,
  subscribeCatalog,
} from "./catalog-store";
import type { Category, Product } from "./catalog";

export function useCatalog() {
  const { products, categories } = useSyncExternalStore(
    subscribeCatalog,
    getCatalog,
    getCatalog,
  );

  return {
    products,
    categories,
    saveProduct: (p: Product) => saveProductInStore(p),
    toggleFlag: (
      id: string,
      flag: "featured" | "isNew",
      value: boolean,
    ) => toggleProductFlagInStore(id, flag, value),
    setProductActive: (id: string, active: boolean) =>
      setProductActiveInStore(id, active),
    saveCategory: (c: Category) => saveCategoryInStore(c),
    setCategoryActive: (id: string, active: boolean) =>
      setCategoryActiveInStore(id, active),
    moveCategory: (id: string, dir: -1 | 1) =>
      moveCategoryInStore(id, dir),
    reset: resetCatalogStore,
  };
}
