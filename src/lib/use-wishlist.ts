"use client";

import { useAccountWishlist } from "@/components/account/account-wishlist-provider";
import { useSyncExternalStore } from "react";
import {
  clearWishlistStore,
  getWishlist,
  getWishlistServer,
  subscribeWishlist,
  toggleWishlistStore,
} from "./wishlist-store";

export function useWishlist() {
  const cloud = useAccountWishlist();
  const guestIds = useSyncExternalStore(
    subscribeWishlist,
    getWishlist,
    getWishlistServer,
  );

  const ids = cloud?.ids ?? guestIds;
  return {
    ids,
    count: ids.length,
    ready: cloud?.ready ?? true,
    busy: cloud?.busy ?? false,
    error: cloud?.error ?? "",
    synced: !!cloud,
    retry: cloud?.refresh,
    has: (id: string) => ids.includes(id),
    toggle: async (id: string): Promise<boolean> => {
      if (cloud) return cloud.toggle(id);
      toggleWishlistStore(id);
      return true;
    },
    clear: async (): Promise<boolean> => {
      if (cloud) return cloud.clear();
      clearWishlistStore();
      return true;
    },
  };
}
