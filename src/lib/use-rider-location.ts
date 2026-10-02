"use client";

/**
 * Adaptive rider-GPS reporting while online (item Z lifted it out of the page;
 * item Q made it resilient). A fix only goes out when the rider moved ≥50 m or
 * the 2-minute heartbeat is due (`shouldSendFix`); the fallback ping is every
 * 30 s on an active trip and every 2 minutes while idle-online.
 *
 * Q: coming back to the app (tab visible again) sends a fresh fix at once —
 * the browser suspended GPS while hidden, so the last upload may be minutes
 * old — and the hook reports what it knows (last device fix, last error, last
 * upload failed, permission) so the page can warn the rider instead of
 * silently tracking nothing.
 */
import { useEffect, useRef, useState } from "react";
import { shouldSendFix, type SentFix } from "./location-throttle";
import { geoErrorKind, type GeoErrorKind } from "./location-health";

export const TRIP_PING_MS = 30_000;
export const IDLE_PING_MS = 120_000;

export interface LocationReport {
  /** Epoch ms of the last position the device produced. */
  lastFixAt: number | null;
  lastError: GeoErrorKind | null;
  /** The last upload to the server failed. */
  sendFailed: boolean;
  permission: "granted" | "denied" | "prompt" | null;
}

export function useRiderLocationTracking(opts: {
  /** Signed in AND online — otherwise nothing is watched or sent. */
  enabled: boolean;
  hasActiveTrip: boolean;
  /** Resolve `false` (or reject) when the upload failed. */
  send: (lat: number, lng: number) => unknown;
}): LocationReport {
  const { enabled, hasActiveTrip } = opts;
  // Always call the latest sender without re-subscribing the GPS watch.
  const send = useRef(opts.send);
  useEffect(() => {
    send.current = opts.send;
  });
  const lastFix = useRef<SentFix | null>(null);

  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<GeoErrorKind | null>(null);
  const [sendFailed, setSendFailed] = useState(false);
  const [permission, setPermission] = useState<LocationReport["permission"]>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const geo = navigator.geolocation;
    let cancelled = false;

    const upload = (lat: number, lng: number) => {
      lastFix.current = { lat, lng, at: Date.now() };
      Promise.resolve(send.current(lat, lng)).then(
        (ok) => !cancelled && setSendFailed(ok === false),
        () => !cancelled && setSendFailed(true),
      );
    };
    const report = (lat: number, lng: number, force = false) => {
      if (cancelled) return;
      setLastFixAt(Date.now());
      setLastError(null);
      if (force || shouldSendFix(lastFix.current, lat, lng)) upload(lat, lng);
    };
    const fail = (err: { code: number }) => {
      if (!cancelled) setLastError(geoErrorKind(err.code));
    };

    const watchId = geo.watchPosition(
      (pos) => report(pos.coords.latitude, pos.coords.longitude),
      fail,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    const intervalId = window.setInterval(
      () => {
        geo.getCurrentPosition(
          (pos) => report(pos.coords.latitude, pos.coords.longitude),
          fail,
          { enableHighAccuracy: false, timeout: 8000 },
        );
      },
      hasActiveTrip ? TRIP_PING_MS : IDLE_PING_MS,
    );
    // Back from the background: the last upload may be stale, send now.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      geo.getCurrentPosition(
        (pos) => report(pos.coords.latitude, pos.coords.longitude, true),
        fail,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
      );
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      geo.clearWatch(watchId);
      window.clearInterval(intervalId);
      // A later session must not inherit this one's health.
      setLastFixAt(null);
      setLastError(null);
      setSendFailed(false);
    };
  }, [enabled, hasActiveTrip]);

  // Permission state (where the browser can tell us) — a revoked permission
  // is the commonest silent cause of "tracking stopped".
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const apply = () => status && !cancelled && setPermission(status.state as LocationReport["permission"]);
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        apply();
        s.addEventListener("change", apply);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener("change", apply);
    };
  }, [enabled]);

  return { lastFixAt, lastError, sendFailed, permission };
}
