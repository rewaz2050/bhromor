"use client";

/**
 * Adaptive rider-GPS reporting while online (item Z, lifted from the page).
 * A fix only goes out when the rider moved ≥50 m or the 2-minute heartbeat is
 * due (`shouldSendFix`); the fallback ping is every 30 s on an active trip and
 * every 2 minutes while idle-online.
 */
import { useEffect, useRef } from "react";
import { shouldSendFix, type SentFix } from "./location-throttle";

export const TRIP_PING_MS = 30_000;
export const IDLE_PING_MS = 120_000;

export function useRiderLocationTracking(opts: {
  /** Signed in AND online — otherwise nothing is watched or sent. */
  enabled: boolean;
  hasActiveTrip: boolean;
  send: (lat: number, lng: number) => unknown;
}): void {
  const { enabled, hasActiveTrip } = opts;
  // Always call the latest sender without re-subscribing the GPS watch.
  const send = useRef(opts.send);
  useEffect(() => {
    send.current = opts.send;
  });
  const lastFix = useRef<SentFix | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const geo = navigator.geolocation;

    const report = (lat: number, lng: number) => {
      if (!shouldSendFix(lastFix.current, lat, lng)) return;
      lastFix.current = { lat, lng, at: Date.now() };
      void send.current(lat, lng);
    };
    const watchId = geo.watchPosition(
      (pos) => report(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    const intervalId = window.setInterval(
      () => {
        geo.getCurrentPosition(
          (pos) => report(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: false, timeout: 8000 },
        );
      },
      hasActiveTrip ? TRIP_PING_MS : IDLE_PING_MS,
    );
    return () => {
      geo.clearWatch(watchId);
      window.clearInterval(intervalId);
    };
  }, [enabled, hasActiveTrip]);
}
