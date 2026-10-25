"use client";

/** Rider push state for the home-screen card: what this phone can do, and one-tap on/off. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  disableRiderPush,
  enableRiderPush,
  fetchRiderPushStatus,
  readLocalPush,
  repairRiderPush,
  riderPushBlocker,
  riderRecoverySteps,
  type Permission,
  type RiderPushStatus,
} from "./rider-push-client";
import type { PushEnv } from "./push-client";

export type RiderPushPhase =
  | "loading"
  | "error" // local status could not be checked; retry without prompting
  | "off-server" // the server has no VAPID keys / migration — nothing the rider can do
  | "blocked" // this browser can't
  | "denied" // permission refused (sticky)
  | "off" // can be turned on
  | "on";

export const useRiderPush = (enabled: boolean) => {
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<RiderPushStatus | null>(null);
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
      const local = await readLocalPush();
      if (!current()) return false;
      let server: RiderPushStatus | null = null;
      try {
        server = await fetchRiderPushStatus();
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
        !riderPushBlocker(local.env)
      ) {
        const repaired = await repairRiderPush(server);
        if (!current()) return false;
        if (repaired.ok) setSubscribed(true);
      }
      return true;
    } catch {
      if (current()) {
        if (!probed) setProbeFailed(true);
        setError(
          probed
            ? "নোটিফিকেশন চালু করা গেল না — আবার চেষ্টা করুন।"
            : "নোটিফিকেশনের অবস্থা জানা যায়নি। আবার চেষ্টা করুন।",
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
      const result = await enableRiderPush();
      if (!current()) return false;
      if (result.ok) {
        await refresh();
        return current();
      }
      if (result.reason === "denied") setPermission("denied");
      else if (result.reason === "dismissed")
        setError("অনুমতি দেওয়া হয়নি — আবার চেষ্টা করুন এবং “Allow” চাপুন।");
      else if (result.reason === "unconfigured")
        setError("নোটিফিকেশন এখনো চালু হয়নি — অফিসকে জানান।");
      else
        setError(
          result.message ?? "নোটিফিকেশন চালু করা গেল না — আবার চেষ্টা করুন।",
        );
      return false;
    } catch {
      if (current()) setError("নোটিফিকেশন চালু করা গেল না — আবার চেষ্টা করুন।");
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
      await disableRiderPush();
      if (!current()) return;
      setSubscribed(false);
      setStatus((s) => (s ? { ...s, count: Math.max(0, s.count - 1) } : s));
    } catch {
      if (current()) setError("বন্ধ করা গেল না — আবার চেষ্টা করুন।");
    } finally {
      if (current()) setBusy(false);
    }
  }, [lifetime]);

  let phase: RiderPushPhase = "loading";
  if (probeFailed) phase = "error";
  else if (loaded && env) {
    if (status && (!status.configured || !status.tableReady))
      phase = "off-server";
    else if (riderPushBlocker(env)) phase = "blocked";
    else if (permission === "denied") phase = "denied";
    else if (permission === "granted" && subscribed) phase = "on";
    else phase = "off";
  }
  return {
    phase: (enabled ? phase : "loading") as RiderPushPhase,
    busy: enabled && busy,
    error: enabled ? error : null,
    blocker: enabled && env ? riderPushBlocker(env) : null,
    steps: enabled && env ? riderRecoverySteps(env, permission) : [],
    enable,
    disable,
    retry,
  };
};
