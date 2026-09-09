"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getNotifs,
  getNotifsServer,
  readAllNotifs,
  readNotif,
  resetNotifs,
  subscribeNotifs,
} from "./notifications-store";
import {
  unreadCountOf,
  type Notif,
} from "./notification-store";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Staff inbox (§35) with live cutover (see use-coupons.ts).
 * Staff sessions read their own notices + mark them read through
 * /api/admin/notifications; demo keeps the seeded browser store.
 */
export function useNotifications() {
  const demo = useSyncExternalStore(subscribeNotifs, getNotifs, getNotifsServer);
  const { live, checked } = useStaffLive();
  const [liveNotifs, setLiveNotifs] = useState<Notif[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ notifications: Notif[] }>(
        "/api/admin/notifications",
      );
      setLiveNotifs(data.notifications);
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
      setLiveNotifs(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const read = useCallback(
    async (id: string): Promise<void> => {
      if (!live) {
        readNotif(id);
        return;
      }
      try {
        await apiSend("/api/admin/notifications", "PATCH", { id });
        setError(null);
        setLiveNotifs((prev) =>
          prev ? prev.map((n) => (n.id === id ? { ...n, read: true } : n)) : prev,
        );
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live],
  );

  const readAll = useCallback(async (): Promise<void> => {
    if (!live) {
      readAllNotifs();
      return;
    }
    try {
      await apiSend("/api/admin/notifications", "PATCH", { all: true });
      setError(null);
      setLiveNotifs((prev) =>
        prev ? prev.map((n) => ({ ...n, read: true })) : prev,
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [live]);

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetNotifs();
  }, [live, refresh]);

  const notifs = live ? (liveNotifs ?? []) : demo;
  return {
    notifs,
    unread: unreadCountOf(notifs),
    read,
    readAll,
    reset,
    refresh,
    live,
    loading: live && (!checked || liveNotifs === null),
    error,
    clearError: () => setError(null),
  };
}
