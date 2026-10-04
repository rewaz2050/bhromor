"use client";

/** The rider's trip history, cursor-paged (Phase C). */
import { useCallback, useEffect, useState } from "react";
import { riderFetch } from "./use-rider";
import type { RiderHistoryItem } from "./rider-history";

export function useRiderHistory(enabled: boolean) {
  const [items, setItems] = useState<RiderHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: string | null, append: boolean): Promise<void> => {
    setLoading(true);
    try {
      const page = await riderFetch<{ items: RiderHistoryItem[]; nextCursor: string | null }>(
        `/api/rider/history${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      );
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load(null, false);
  }, [enabled, load]);

  return {
    items,
    hasMore: cursor !== null,
    loading,
    error,
    refresh: () => load(null, false),
    loadMore: () => (cursor ? load(cursor, true) : Promise.resolve()),
  };
}
