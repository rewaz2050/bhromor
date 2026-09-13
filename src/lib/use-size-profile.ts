"use client";

/**
 * The shopper's saved body (P0 #1) as a reactive value.
 *
 * Saved once, used everywhere: the size finder drawer writes it, the product
 * page reads it to badge the size buttons, and the bundle offer uses it to pick
 * a size per piece so "add the set" does not add four wrong sizes.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  getSizeProfile,
  getSizeProfileServer,
  saveSizeProfile,
  clearSizeProfile,
  subscribeSizeProfile,
  type SizeProfile,
} from "./size-finder";

export function useSizeProfile(): {
  profile: SizeProfile | null;
  save: (profile: SizeProfile) => boolean;
  clear: () => void;
} {
  const profile = useSyncExternalStore(subscribeSizeProfile, getSizeProfile, getSizeProfileServer);
  const save = useCallback((next: SizeProfile) => saveSizeProfile(next), []);
  const clear = useCallback(() => clearSizeProfile(), []);
  return { profile, save, clear };
}
