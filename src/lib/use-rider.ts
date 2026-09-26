/**
 * Rider client layer (marketplace phase 3, slice 7+).
 *
 * Session + jobs hooks for /api/rider/*. Live only: an authenticated linked
 * rider sees real jobs, everyone else is routed to /rider/login by the shell.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "./supabase-browser";
import { usePoll } from "./use-poll";
import type { Rider } from "./catalog";
import type { RiderJob, RiderSettlement, SettleClaim } from "./db/riders";

/**
 * Job feed refresh while the app is on screen. A dispatch offer lives 90 s,
 * so 15 s keeps a new offer visible with most of its window left; usePoll
 * stops the timer while the phone is in a pocket (tab hidden) and refreshes
 * the instant the rider looks again.
 */
export const RIDER_JOBS_POLL_MS = 15_000;
/**
 * Backup poll while the realtime socket is connected — offers arrive over
 * the channel in under a second, so this only heals a dropped message.
 * Socket down (or realtime unpublished) → back to the 15 s poll.
 */
export const RIDER_JOBS_POLL_BACKUP_MS = 120_000;

/** Why a signed-in user was refused (mirrors RiderDenyReason server-side). */
export type RiderDenyReason = "none" | "pending" | "suspended";

export class RiderApiError extends Error {
  status: number;
  reason?: RiderDenyReason;
  constructor(message: string, status: number, reason?: RiderDenyReason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

const FALLBACK = "Something went wrong — please try again.";

const readError = async (
  res: Response,
): Promise<{ message: string; reason?: RiderDenyReason }> => {
  try {
    const data = (await res.json()) as { error?: string; reason?: string };
    const reason =
      data.reason === "pending" || data.reason === "suspended" || data.reason === "none"
        ? data.reason
        : undefined;
    return { message: data.error || FALLBACK, reason };
  } catch {
    return { message: FALLBACK };
  }
};

const riderFetch = async <T,>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: method === "GET" ? "no-store" : undefined,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RiderApiError("Could not reach the server.", 0);
  }
  if (!res.ok) {
    const { message, reason } = await readError(res);
    throw new RiderApiError(message, res.status, reason);
  }
  return (await res.json()) as T;
};

export const riderErrorMessage = (err: unknown): string =>
  err instanceof RiderApiError
    ? err.message
    : "Something went wrong — please try again.";

/**
 * Session probe for the rider app. `status` is "guest" both for a signed-out
 * visitor and for a signed-in account the API refused; the latter also
 * carries `error` (+ `denyReason` — "pending" while the application awaits
 * approval, since apply = sign up as of 2026-09-26) so the login page can
 * show what to do next instead of bouncing between /rider and /rider/login.
 */
export const useRiderSession = () => {
  const [rider, setRider] = useState<Rider | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "checking" | "authed" | "guest"
  >("checking");
  const [error, setError] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState<RiderDenyReason | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus((prev) => (prev === "authed" ? prev : "checking"));
    setError(null);
    setDenyReason(null);
    try {
      const data = await riderFetch<{ rider: Rider; email: string }>(
        "/api/rider/me",
      );
      setRider(data.rider);
      setEmail(data.email);
      setStatus("authed");
    } catch (err) {
      setRider(null);
      setEmail("");
      setStatus("guest");
      if (err instanceof RiderApiError && err.status === 403) {
        setError(err.message);
        setDenyReason(err.reason ?? "none");
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (loginEmail: string, password: string): Promise<string | null> => {
      const client = getSupabaseBrowser();
      if (!client) return "Rider sign-in needs Supabase to be configured.";
      const { error: authError } = await client.auth.signInWithPassword({
        email: loginEmail.trim(),
        password,
      });
      if (authError) return "Email or password did not match.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await getSupabaseBrowser()?.auth.signOut().catch(() => undefined);
    setRider(null);
    setEmail("");
    setStatus("guest");
    setError(null);
    setDenyReason(null);
  }, []);

  /** P2 #22 — save the rider's own shift; auto-dispatch honours it. */
  const setAvailability = useCallback(
    async (payload: {
      fromHour: number | null;
      toHour: number | null;
      days: number[];
    }): Promise<string | null> => {
      try {
        await riderFetch("/api/rider/availability", "PATCH", payload);
        await refresh();
        return null;
      } catch (err) {
        return riderErrorMessage(err);
      }
    },
    [refresh],
  );

  return {
    rider,
    email,
    status,
    error,
    denyReason,
    refresh,
    signIn,
    signOut,
    setAvailability,
  };
};

export const useRiderJobs = (enabled: boolean, riderId?: string | null) => {
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [settlements, setSettlements] = useState<RiderSettlement[]>([]);
  const [pendingClaim, setPendingClaim] = useState<SettleClaim | null>(null);
  const [claimsReady, setClaimsReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // One in-flight read at a time: a poll tick that lands while an accept →
  // refresh is running would otherwise race it and paint the older answer.
  const inflight = useRef<Promise<boolean> | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    if (inflight.current) return inflight.current;
    const run = (async () => {
      setLoading(true);
      setError(null);
      try {
        // Jobs are the dashboard; settlements are a side panel. A failures
        // in one must not blank the other (2026-09-25: a pending database
        // migration answered 503 for settlements and hid every live job).
        const [jobsResult, settleResult] = await Promise.allSettled([
          riderFetch<{ jobs: RiderJob[] }>("/api/rider/jobs"),
          riderFetch<{
            settlements: RiderSettlement[];
            pendingClaim: SettleClaim | null;
            claimsReady?: boolean;
          }>("/api/rider/settlements"),
        ]);
        if (jobsResult.status === "fulfilled") {
          setJobs(jobsResult.value.jobs);
        } else {
          setError(riderErrorMessage(jobsResult.reason));
        }
        if (settleResult.status === "fulfilled") {
          setSettlements(settleResult.value.settlements);
          setPendingClaim(settleResult.value.pendingClaim ?? null);
          setClaimsReady(settleResult.value.claimsReady ?? true);
        } else {
          // Keep the last settlements on screen; never block the job feed.
          setClaimsReady(false);
        }
        return jobsResult.status === "fulfilled";
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);
  // Instant offers over Realtime: refresh the moment this rider's
  // assignment rows change. RLS ("assignments rider read own") limits the
  // channel to their rows; the filter additionally scopes socket traffic.
  // No socket (unpublished table, flaky net, signed out) → poll backup.
  useEffect(() => {
    if (!enabled || !riderId) return;
    const client = getSupabaseBrowser();
    if (!client) return;
    const channel = client
      .channel(`rider-jobs:${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_assignments",
          filter: `rider_id=eq.${riderId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      setLive(false);
      void client.removeChannel(channel);
    };
  }, [enabled, riderId, refresh]);
  // Background feed refresh — before this the rider had to reload the page
  // to see a new offer (or an offer that had expired under them).
  usePoll(refresh, live ? RIDER_JOBS_POLL_BACKUP_MS : RIDER_JOBS_POLL_MS, enabled);

  const run = async (
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    try {
      await riderFetch<unknown>(path, "POST", body);
      await refresh();
      return true;
    } catch (err) {
      // Another rider may have won. Remove stale offers, then retain the
      // conflict message (refresh normally clears errors).
      if (err instanceof RiderApiError && err.status === 409) await refresh();
      setError(riderErrorMessage(err));
      return false;
    }
  };

  const accept = useCallback(
    (id: string) => run(`/api/rider/assignments/${encodeURIComponent(id)}/accept`),
    // refresh is stable for a given enabled state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );
  const pickup = useCallback(
    (id: string) => run(`/api/rider/assignments/${encodeURIComponent(id)}/pickup`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );
  const reject = useCallback(
    (id: string) => run(`/api/rider/assignments/${encodeURIComponent(id)}/reject`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );
  const deliver = useCallback(
    (id: string, code: string, proofUrl?: string | null) =>
      run(`/api/rider/assignments/${encodeURIComponent(id)}/deliver`, { code, proofUrl }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );
  const setOnline = useCallback(
    async (isOnline: boolean): Promise<boolean> => {
      try {
        await riderFetch("/api/rider/online", "PATCH", { isOnline });
        setError(null);
        return true;
      } catch (err) {
        setError(riderErrorMessage(err));
        return false;
      }
    },
    [],
  );
  const updateLocation = useCallback(
    async (lat: number, lng: number): Promise<boolean> => {
      try {
        await riderFetch("/api/rider/location", "PATCH", { lat, lng });
        setError(null);
        return true;
      } catch {
        // silent fail for location
        return false;
      }
    },
    [],
  );
  const settle = useCallback(
    async (method: string, reference: string): Promise<boolean> => {
      try {
        await riderFetch("/api/rider/settle", "POST", { method, reference });
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(riderErrorMessage(err));
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  return { jobs, settlements, pendingClaim, claimsReady, loading, live, error, refresh, accept, pickup, reject, deliver, setOnline, updateLocation, settle };
};

export interface RiderStatsView {
  totalDeliveries: number;
  weekDeliveries: number;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * The rider's scoreboard (202609250008). Fetched once per app open (not with
 * the 15 s job poll — these numbers do not change that fast); `refresh`
 * re-reads after a delivery or a settle, when the numbers actually move.
 */
export const useRiderStats = (enabled: boolean) => {
  const [stats, setStats] = useState<RiderStatsView | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    try {
      const data = await riderFetch<{ stats: RiderStatsView }>("/api/rider/stats");
      setStats(data.stats);
    } catch {
      // The scoreboard is decoration on top of real work — never an error
      // banner; the last known numbers stay on screen.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    setLoading(true);
    void refresh();
  }, [enabled, refresh]);

  return { stats, loading, refresh };
};
