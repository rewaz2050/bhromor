"use client";

import { useSyncExternalStore } from "react";
import {
  getMedia,
  getMediaServer,
  subscribeMedia,
  addMediaInStore,
  removeMediaInStore,
  resetMediaStore,
} from "./media-store";
import type { Category, Product } from "./catalog";

export function useMedia(products: Product[], categories: Category[]) {
  // Snapshot for SSR stays empty-safe; client hydrates from the real scan.
  const items = useSyncExternalStore(
    subscribeMedia,
    () => getMedia(products, categories),
    getMediaServer,
  );

  return {
    items,
    add: (item: { url: string; alt: string; label: string }) =>
      addMediaInStore(products, categories, item),
    remove: (id: string) => removeMediaInStore(id),
    reset: resetMediaStore,
  };
}
