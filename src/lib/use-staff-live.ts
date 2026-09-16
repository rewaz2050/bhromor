"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAdminAuthed,
  probeStaffSession,
  staffProbeError,
  subscribeAdminAuth,
  type StaffProbe,
} from "./admin-auth";

/**
 * Single shared staff-session probe for the admin data hooks.
 * Staff sessions are always live (Supabase): the probe verifies the
 * session against /api/admin/me once per mount cycle (module-cached).
 *
 * `error` is the honest reason when the probe says NOT live while the
 * browser thinks it is signed in (server unreachable, session not seen,
 * account not staff). Before 2026-09-16 it was swallowed: every admin page
 * then rendered empty lists / default settings as if the shop had no data.
 */

let probePromise: Promise<StaffProbe> | null = null;

const probeOnce = (): Promise<StaffProbe> => {
  if (!probePromise) {
    probePromise = probeStaffSession().catch(
      (): StaffProbe => ({ staff: false, status: 0, reason: "Could not reach the server." }),
    );
  }
  return probePromise;
};

export const __resetStaffProbe = (): void => {
  probePromise = null;
};

export interface StaffLiveState {
  live: boolean;
  checked: boolean;
  /** Why the session is not live although the browser holds a staff flag. */
  error: string | null;
}

export function useStaffLive(): StaffLiveState & { retry: () => void } {
  const authed = useSyncExternalStore(
    subscribeAdminAuth,
    getAdminAuthed,
    () => false,
  );
  const [state, setState] = useState<StaffLiveState>({
    live: false,
    checked: !authed,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets probe state
      setState({ live: false, checked: true, error: null });
      return;
    }
    let cancelled = false;
    void probeOnce().then((probe) => {
      if (cancelled) return;
      setState({
        live: probe.staff,
        checked: true,
        error: probe.staff ? null : staffProbeError(probe),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authed, attempt]);

  const retry = () => {
    __resetStaffProbe();
    setAttempt((n) => n + 1);
  };

  return { ...state, retry };
}
