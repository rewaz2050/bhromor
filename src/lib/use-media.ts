"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getMedia,
  getMediaServer,
  scanMedia,
  subscribeMedia,
  addMediaInStore,
  removeMediaInStore,
  resetMediaStore,
  type MediaItem,
} from "./media-store";
import type { Category, Product } from "./catalog";
import type { LibraryMediaItem } from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Media library (§49) with live cutover.
 * The in-use scan (products · categories · hero · brand) always comes from
 * the catalog; the "added" shelf is the browser store in demo and the
 * media_library table for staff sessions. Live rows carry `lib:<uuid>` ids.
 */
export function useMedia(products: Product[], categories: Category[]) {
  // Snapshot for SSR stays empty-safe; client hydrates from the real scan.
  const demoItems = useSyncExternalStore(
    subscribeMedia,
    () => getMedia(products, categories),
    getMediaServer,
  );
  const { live, checked } = useStaffLive();
  const [library, setLibrary] = useState<LibraryMediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ items: LibraryMediaItem[] }>(
        "/api/admin/media",
      );
      setLibrary(data.items);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLibrary(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const items: MediaItem[] = useMemo(() => {
    if (!live) return demoItems;
    const base = scanMedia(products, categories).filter(
      (m) => m.kind !== "custom",
    );
    const added: MediaItem[] = (library ?? []).map((row) => ({
      id: `lib:${row.id}`,
      url: row.url,
      alt: row.alt,
      label: row.label || "Library image",
      kind: "custom",
      mediaType: row.mediaType,
    }));
    return [...base, ...added];
  }, [live, demoItems, library, products, categories]);

  const add = useCallback(
    async (item: {
      url: string;
      alt: string;
      label: string;
      mediaType?: MediaItem["mediaType"];
    }): Promise<boolean> => {
      if (!live) {
        addMediaInStore(products, categories, item);
        return true;
      }
      try {
        await apiSend("/api/admin/media", "POST", item);
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh, products, categories],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!live || !id.startsWith("lib:")) {
        if (!live) removeMediaInStore(id);
        return;
      }
      try {
        await apiSend(
          `/api/admin/media?id=${encodeURIComponent(id.slice(4))}`,
          "DELETE",
        );
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, refresh],
  );

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetMediaStore();
  }, [live, refresh]);

  return {
    items,
    add,
    remove,
    reset,
    live,
    loading: live && (!checked || library === null),
    error,
    clearError: () => setError(null),
  };
}
