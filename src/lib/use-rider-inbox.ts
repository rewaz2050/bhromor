"use client";

/**
 * Rider inbox (202610020001). `poll` keeps the nav badge fresh once a minute;
 * the inbox page calls `markRead` after the rider has seen the list.
 */
import { useCallback, useEffect, useState } from "react";
import { riderFetch } from "./use-rider";
import type { InboxItem } from "./rider-inbox";

export const INBOX_READ_EVENT = "rider-inbox-read";

export const useRiderInbox = (enabled: boolean, pollMs = 0) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    try {
      const data = await riderFetch<{ ready: boolean; items: InboxItem[]; unread: number }>("/api/rider/inbox");
      setItems(data.items);
      setUnread(data.unread);
      setReady(data.ready);
    } catch {
      // A message board is never worth an error banner; keep what we had.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const markRead = useCallback(async (): Promise<void> => {
    try {
      await riderFetch<{ ok: boolean }>("/api/rider/inbox", "POST");
      setUnread(0);
      // Other mounted copies (the nav badge) zero themselves too.
      if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_READ_EVENT));
    } catch {
      /* retried on the next open */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
    if (pollMs <= 0) return;
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [enabled, pollMs, refresh]);

  useEffect(() => {
    const onRead = () => setUnread(0);
    window.addEventListener(INBOX_READ_EVENT, onRead);
    return () => window.removeEventListener(INBOX_READ_EVENT, onRead);
  }, []);

  return { items, unread, ready, loading, refresh, markRead };
};
