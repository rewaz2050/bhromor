"use client";

import React, { useCallback, useEffect, useState } from "react";
import { unreadCountOf, type Notif } from "./notification-store";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Staff inbox (§35) — live only. Staff sessions read their own notices +
 * mark them read through /api/admin/notifications.
 */
export function useNotifications() {
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
        const AudioCtor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtor) audioContextRef.current = new AudioCtor();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
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
          try {
            (
              navigator as Navigator & {
                vibrate?: (pattern: number | number[]) => boolean;
              }
            ).vibrate?.([200, 100, 200]);
          } catch {}
        }
      }
    }
    prevUnreadRef.current = unread;
  }, [playBeep]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
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
      if (!live) return;
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
    if (!live) return;
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

  const notifs = live ? (liveNotifs ?? []) : [];
  return {
    notifs,
    unread: unreadCountOf(notifs),
    read,
    readAll,
    reset: refresh,
    refresh,
    live,
    loading: live && (!checked || liveNotifs === null),
    error,
    clearError: () => setError(null),
  };
}
