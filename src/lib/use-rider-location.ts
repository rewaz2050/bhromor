"use client";

/**
 * Adaptive rider-GPS reporting while online (item Z lifted it out of the page;
 * item Q made it resilient; the Android app gave it a second engine).
 *
 * TWO ENGINES, one contract:
 *
 *  • NATIVE (the installed APK) — `@capgo/background-geolocation` runs an
 *    Android foreground service, so fixes keep arriving with the screen off
 *    and the phone in a pocket. This is the engine the web app could never
 *    have, and it is the whole reason the app exists. No wake lock, no
 *    fallback ping: the service streams, and reports its own errors.
 *
 *  • BROWSER (a phone's Chrome, or an APK built before the plugin landed) —
 *    `navigator.geolocation.watchPosition` plus a fallback ping every 30 s on
 *    an active trip / 2 min idle-online, and a fresh fix the moment the tab
 *    comes back, because the browser suspends GPS while it is hidden.
 *
 * Both go through the same throttle (`shouldSendFix`: ≥50 m, or the 2-minute
 * heartbeat) and the same health reporting, so the rider's board, the admin
 * map and the customer's tracker cannot tell them apart — and a rider on an
 * old build simply keeps working.
 */
import { useEffect, useRef, useState } from "react";
import { shouldSendFix, type SentFix } from "./location-throttle";
import {
  geoErrorKind,
  type GeoErrorKind,
  type LocationEngine,
} from "./location-health";
import { nativeGpsAvailable, startNativeGps } from "./native-location";

export const TRIP_PING_MS = 30_000;
export const IDLE_PING_MS = 120_000;

export type { LocationEngine };

export interface LocationReport {
  /** Epoch ms of the last position the device produced. */
  lastFixAt: number | null;
  lastError: GeoErrorKind | null;
  /** The last upload to the server failed. */
  sendFailed: boolean;
  permission: "granted" | "denied" | "prompt" | null;
  /**
   * `native` only inside the installed app with the plugin compiled in —
   * i.e. when tracking survives the screen going off. Null until an engine
   * has actually started.
   */
  engine: LocationEngine | null;
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
  const [engine, setEngine] = useState<LocationEngine | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    let cancelled = false;
    let nativeStop: (() => void) | null = null;
    let watchId: number | null = null;
    let intervalId: number | null = null;

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
    const fail = (kind: GeoErrorKind) => {
      if (!cancelled) setLastError(kind);
    };

    /* ---------- engine 2: the browser (and any APK without the plugin) ---------- */
    const visibilityHandlers: Array<() => void> = [];
    const startBrowserWatch = () => {
      if (!navigator.geolocation) return;
      const geo = navigator.geolocation;
      setEngine("browser");
      watchId = geo.watchPosition(
        (pos) => report(pos.coords.latitude, pos.coords.longitude),
        (err) => fail(geoErrorKind(err.code)),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
      );
      intervalId = window.setInterval(
        () => {
          geo.getCurrentPosition(
            (pos) => report(pos.coords.latitude, pos.coords.longitude),
            (err) => fail(geoErrorKind(err.code)),
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
          (err) => fail(geoErrorKind(err.code)),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
        );
      };
      document.addEventListener("visibilitychange", onVisible);
      // Released with the watch; kept here so cleanup stays in one place.
      visibilityHandlers.push(onVisible);
    };

    /* ---------- engine 1: the installed app ---------- */
    if (nativeGpsAvailable()) {
      void startNativeGps({
        onFix: (lat, lng) => report(lat, lng),
        onError: fail,
      }).then((result) => {
        if (cancelled) {
          if (result.started) result.stop();
          return;
        }
        if (result.started) {
          nativeStop = result.stop;
          setEngine("native");
          // The plugin asks for permission itself; reflect what it ends up with.
          setPermission("granted");
        } else {
          // Older APK, plugin stripped, bridge odd — the browser path still works.
          startBrowserWatch();
        }
      });
    } else {
      startBrowserWatch();
    }

    return () => {
      cancelled = true;
      for (const off of visibilityHandlers) {
        document.removeEventListener("visibilitychange", off);
      }
      if (nativeStop) nativeStop();
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      if (intervalId !== null) window.clearInterval(intervalId);
      // A later session must not inherit this one's health.
      setLastFixAt(null);
      setLastError(null);
      setSendFailed(false);
      setEngine(null);
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

  return { lastFixAt, lastError, sendFailed, permission, engine };
}
