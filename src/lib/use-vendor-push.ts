"use client";

/** Vendor push state for the dashboard card: what this phone can do, and one-tap on/off. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disableVendorPush,
  enableVendorPush,
  fetchVendorPushStatus,
  readVendorLocalPush,
  repairVendorPush,
  vendorPushBlocker,
  vendorRecoverySteps,
  type VendorPermission,
  type VendorPushStatus,
} from "./vendor-push-client";
import type { PushEnv } from "./push-client";

export type VendorPushPhase =
  | "loading"
  | "off-server" // the server has no VAPID keys / migration — nothing the vendor can do
  | "blocked" // this browser can't
  | "denied" // permission refused (sticky)
  | "off" // can be turned on
  | "on";

export const useVendorPush = (enabled: boolean) => {
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [permission, setPermission] = useState<VendorPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<VendorPushStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const local = await readVendorLocalPush();
    setEnv(local.env);
    setPermission(local.permission);
    setSubscribed(local.subscribed);
    let server: VendorPushStatus | null = null;
    try {
      server = await fetchVendorPushStatus();
      setStatus(server);
    } catch {
      setStatus(null);
    }
    setLoaded(true);
    // Silent repair: granted but the server may not hold this endpoint any more.
    if (server && server.configured && server.tableReady && local.permission === "granted" && !vendorPushBlocker(local.env)) {
      const repaired = await repairVendorPush(server);
      if (repaired.ok) setSubscribed(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled || booted.current) return;
    booted.current = true;
    void refresh();
  }, [enabled, refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await enableVendorPush();
    setBusy(false);
    if (result.ok) {
      await refresh();
      return true;
    }
    if (result.reason === "denied") setPermission("denied");
    else if (result.reason === "dismissed") setError("Permission was not given — try again and tap “Allow”.");
    else if (result.reason === "unconfigured") setError("Notifications are not set up yet — tell PROSANTI.");
    else setError(result.message ?? "Could not turn notifications on — please try again.");
    return false;
  }, [refresh]);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await disableVendorPush();
      setSubscribed(false);
      setStatus((s) => (s ? { ...s, count: Math.max(0, s.count - 1) } : s));
    } catch {
      setError("Could not turn them off — please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  let phase: VendorPushPhase = "loading";
  if (loaded && env) {
    if (status && (!status.configured || !status.tableReady)) phase = "off-server";
    else if (vendorPushBlocker(env)) phase = "blocked";
    else if (permission === "denied") phase = "denied";
    else if (permission === "granted" && subscribed) phase = "on";
    else phase = "off";
  }
  return {
    phase,
    busy,
    error,
    blocker: env ? vendorPushBlocker(env) : null,
    steps: env ? vendorRecoverySteps(env, permission) : [],
    enable,
    disable,
  };
};
