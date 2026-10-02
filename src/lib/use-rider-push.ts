"use client";

/** Rider push state for the home-screen card: what this phone can do, and one-tap on/off. */
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const local = await readLocalPush();
    setEnv(local.env);
    setPermission(local.permission);
    setSubscribed(local.subscribed);
    let server: RiderPushStatus | null = null;
    try {
      server = await fetchRiderPushStatus();
      setStatus(server);
    } catch {
      setStatus(null);
    }
    setLoaded(true);
    // Silent repair: granted but the server may not hold this endpoint any more.
    if (server && server.configured && server.tableReady && local.permission === "granted" && !riderPushBlocker(local.env)) {
      const repaired = await repairRiderPush(server);
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
    const result = await enableRiderPush();
    setBusy(false);
    if (result.ok) {
      await refresh();
      return true;
    }
    if (result.reason === "denied") setPermission("denied");
    else if (result.reason === "dismissed") setError("অনুমতি দেওয়া হয়নি — আবার চেষ্টা করুন এবং “Allow” চাপুন।");
    else if (result.reason === "unconfigured") setError("নোটিফিকেশন এখনো চালু হয়নি — অফিসকে জানান।");
    else setError(result.message ?? "নোটিফিকেশন চালু করা গেল না — আবার চেষ্টা করুন।");
    return false;
  }, [refresh]);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await disableRiderPush();
      setSubscribed(false);
      setStatus((s) => (s ? { ...s, count: Math.max(0, s.count - 1) } : s));
    } catch {
      setError("বন্ধ করা গেল না — আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }, []);

  let phase: RiderPushPhase = "loading";
  if (loaded && env) {
    if (status && (!status.configured || !status.tableReady)) phase = "off-server";
    else if (riderPushBlocker(env)) phase = "blocked";
    else if (permission === "denied") phase = "denied";
    else if (permission === "granted" && subscribed) phase = "on";
    else phase = "off";
  }
  return {
    phase,
    busy,
    error,
    blocker: env ? riderPushBlocker(env) : null,
    steps: env ? riderRecoverySteps(env, permission) : [],
    enable,
    disable,
  };
};
