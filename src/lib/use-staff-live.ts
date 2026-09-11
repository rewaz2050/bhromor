"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAdminAuthed,
  probeStaffSession,
  subscribeAdminAuth,
} from "./admin-auth";

/**
 * Single shared staff-session probe for the admin data hooks.
 * Staff sessions are always live (Supabase): the probe verifies the
 * session against /api/admin/me once per mount cycle (module-cached).
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
  const [state, setState] = useState({ live: false, checked: !authed });

  useEffect(() => {
    if (!authed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets probe state
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
  }, [authed]);

  return state;
}
