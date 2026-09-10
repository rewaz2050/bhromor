"use client";

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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

  // Track previous unread to detect new orders (free, no cost)
  const prevUnreadRef = React.useRef(0);
  const audioContextRef = React.useRef<AudioContext | null>(null);

  const playBeep = React.useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  const maybeNotifyBrowser = React.useCallback((notifs: Notif[]) => {
    const unread = unreadCountOf(notifs);
    const prev = prevUnreadRef.current;
    if (unread > prev && prev !== 0) {
      const latest = notifs.find((n) => !n.read) || notifs[0];
      if (latest) {
        playBeep();
        // Browser Notification (free)
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(latest.title || "PROSANTI New Order", {
              body: latest.body || "New order received — check admin panel",
              icon: "/icon-192.png",
            });
          } catch {}
        }
        // Also vibrate if supported
        if ("vibrate" in navigator) {
          try { (navigator as any).vibrate([200, 100, 200]); } catch {}
        }
      }
    }
    prevUnreadRef.current = unread;
  }, [playBeep]);

  useEffect(() => {
    if (!live) {
      setLiveNotifs(null);
      setError(null);
      return;
    }
    void refresh();
    // Poll every 15s for new orders — free, no external cost, Sunamganj Sadar live
    const id = window.setInterval(() => {
      void refresh();
    }, 15000);
    // Request browser notification permission once (free)
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    return () => window.clearInterval(id);
  }, [live, refresh]);

  useEffect(() => {
    if (live && liveNotifs) {
      maybeNotifyBrowser(liveNotifs);
    }
  }, [live, liveNotifs, maybeNotifyBrowser]);

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
