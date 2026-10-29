"use client";

/** Vendor push state for the dashboard card: what this phone can do, and one-tap on/off. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  | "error" // local status could not be checked; retry without prompting
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
  const [probeFailed, setProbeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useMemo(
    () => Symbol(enabled ? "active push" : "inactive push"),
    [enabled],
  );
  const owner = useRef({ active: false, lifetime, request: 0, action: 0 });

  const refresh = useCallback(async (): Promise<boolean> => {
    const state = owner.current;
    if (!state.active || state.lifetime !== lifetime) return false;
    const request = ++state.request;
    const action = state.action;
    const current = () =>
      state.active &&
      state.lifetime === lifetime &&
      state.request === request &&
      state.action === action;
    let probed = false;
    try {
      const local = await readVendorLocalPush();
      if (!current()) return false;
      let server: VendorPushStatus | null = null;
      try {
        server = await fetchVendorPushStatus();
      } catch {
        /* Keep the existing unknown-server fallback. */
      }
      if (!current()) return false;
      probed = true;
      setProbeFailed(false);
      setError(null);
      setEnv(local.env);
      setPermission(local.permission);
      setSubscribed(local.subscribed);
      setStatus(server);
      setLoaded(true);
      // Only a current probe may initiate automatic endpoint repair.
      if (
        server &&
        server.configured &&
        server.tableReady &&
        local.permission === "granted" &&
        !vendorPushBlocker(local.env)
      ) {
        const repaired = await repairVendorPush(server);
        if (!current()) return false;
        if (repaired.ok) setSubscribed(true);
      }
      return true;
    } catch {
      if (current()) {
        if (!probed) setProbeFailed(true);
        setError(
          probed
            ? "Could not turn notifications on — please try again."
            : "Could not check notification status. Try again.",
        );
      }
      return false;
    }
  }, [lifetime]);

  useEffect(() => {
    const state = owner.current;
    state.active = enabled;
    state.lifetime = lifetime;
    state.request++;
    state.action++;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the observed enabled lifetime before probing
    setEnv(null);
    setPermission("default");
    setSubscribed(false);
    setStatus(null);
    setLoaded(false);
    setProbeFailed(false);
    setBusy(false);
    setError(null);
    if (enabled) void refresh();
    return () => {
      state.active = false;
      state.request++;
      state.action++;
    };
  }, [enabled, lifetime, refresh]);

  // A probe retry never asks for notification permission or reruns disable.
  const retry = useCallback(async (): Promise<boolean> => {
    const state = owner.current;
    if (!state.active || state.lifetime !== lifetime) return false;
    setLoaded(false);
    setProbeFailed(false);
    setError(null);
    return refresh();
  }, [lifetime, refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    const state = owner.current;
    if (!state.active || state.lifetime !== lifetime) return false;
    const action = ++state.action;
    state.request++;
    const current = () =>
      state.active && state.lifetime === lifetime && state.action === action;
    setBusy(true);
    setError(null);
    try {
      const result = await enableVendorPush();
      if (!current()) return false;
      if (result.ok) {
        await refresh();
        return current();
      }
      if (result.reason === "denied") setPermission("denied");
      else if (result.reason === "dismissed")
        setError("Permission was not given — try again and tap “Allow”.");
      else if (result.reason === "unconfigured")
        setError("Notifications are not set up yet — tell PROSANTI.");
      else
        setError(
          result.message ??
            "Could not turn notifications on — please try again.",
        );
      return false;
    } catch {
      if (current())
        setError("Could not turn notifications on — please try again.");
      return false;
    } finally {
      if (current()) setBusy(false);
    }
  }, [lifetime, refresh]);

  const disable = useCallback(async (): Promise<void> => {
    const state = owner.current;
    if (!state.active || state.lifetime !== lifetime) return;
    const action = ++state.action;
    state.request++;
    const current = () =>
      state.active && state.lifetime === lifetime && state.action === action;
    setBusy(true);
    setError(null);
    try {
      await disableVendorPush();
      if (!current()) return;
      setSubscribed(false);
      setStatus((s) => (s ? { ...s, count: Math.max(0, s.count - 1) } : s));
    } catch {
      if (current()) setError("Could not turn them off — please try again.");
    } finally {
      if (current()) setBusy(false);
    }
  }, [lifetime]);

  let phase: VendorPushPhase = "loading";
  if (probeFailed) phase = "error";
  else if (loaded && env) {
    if (status && (!status.configured || !status.tableReady))
      phase = "off-server";
    else if (vendorPushBlocker(env)) phase = "blocked";
    else if (permission === "denied") phase = "denied";
    else if (permission === "granted" && subscribed) phase = "on";
    else phase = "off";
  }
  return {
    phase: (enabled ? phase : "loading") as VendorPushPhase,
    busy: enabled && busy,
    error: enabled ? error : null,
    blocker: enabled && env ? vendorPushBlocker(env) : null,
    steps: enabled && env ? vendorRecoverySteps(env, permission) : [],
    enable,
    disable,
    retry,
  };
};
