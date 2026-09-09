"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAdminAuthed,
  getAdminMode,
  probeStaffSession,
  subscribeAdminAuth,
} from "./admin-auth";

/**
 * Single shared staff-session probe for the admin data hooks.
 * Demo mode resolves instantly without any fetch; live mode probes
 * /api/admin/me once per mount cycle (module-cached promise).
 */

let probePromise: Promise<boolean> | null = null;

const probeOnce = (): Promise<boolean> => {
  if (!probePromise) {
    probePromise = probeStaffSession()
      .then(({ staff }) => staff)
      .catch(() => false);
  }
  return probePromise;
};

export const __resetStaffProbe = (): void => {
  probePromise = null;
};

export function useStaffLive(): { live: boolean; checked: boolean } {
  const authed = useSyncExternalStore(
    subscribeAdminAuth,
    getAdminAuthed,
    () => false,
  );
  const staffMode = authed && getAdminMode() === "live";
  const [state, setState] = useState({ live: false, checked: !staffMode });

  useEffect(() => {
    if (!staffMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets probe state
      setState({ live: false, checked: true });
      return;
    }
    let cancelled = false;
    void probeOnce().then((ok) => {
      if (!cancelled) setState({ live: ok, checked: true });
    });
    return () => {
      cancelled = true;
    };
  }, [staffMode]);

  return staffMode ? state : { live: false, checked: true };
}
