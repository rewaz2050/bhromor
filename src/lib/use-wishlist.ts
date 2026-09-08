"use client";

import { useSyncExternalStore } from "react";
import {
  clearWishlistStore,
  getWishlist,
  subscribeWishlist,
  toggleWishlistStore,
} from "./wishlist-store";

export function useWishlist() {
  const ids = useSyncExternalStore(
    subscribeWishlist,
    getWishlist,
    getWishlist,
  );

  return {
    ids,
    count: ids.length,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => toggleWishlistStore(id),
    clear: clearWishlistStore,
  };
}
