"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { scanMedia, type MediaItem } from "./media-store";
import type { Category, Product } from "./catalog";
import type { LibraryMediaItem } from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Media library (§49) — live only. The in-use scan (products · categories ·
 * hero · brand) always comes from the catalog; the "added" shelf is the
 * media_library table. Live rows carry `lib:<uuid>` ids.
 */
export function useMedia(products: Product[], categories: Category[]) {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setLibrary(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const items: MediaItem[] = useMemo(() => {
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
  }, [library, products, categories]);

  const add = useCallback(
    async (item: {
      url: string;
      alt: string;
      label: string;
      mediaType?: MediaItem["mediaType"];
    }): Promise<boolean> => {
      if (!live) return false;
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
    [live, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!live || !id.startsWith("lib:")) return;
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

  return {
    items,
    add,
    remove,
    reset: refresh,
    live,
    loading: live && (!checked || library === null),
    error,
    clearError: () => setError(null),
  };
}
