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

/**
 * Session states (2026-09-25): "guest" is strictly "no Supabase session".
 * A signed-in account carries its own state so the shell never bounces a
 * pending applicant back to /rider/login (the old infinite loop):
 * - authed: active rider, dashboard unlocked
 * - pending: application awaiting admin approval
 * - suspended: account suspended, contact support
 * - norider: signed in but no rider row — point at /rider/apply
 */
export type RiderSessionStatus =
  | "checking"
  | "authed"
  | "pending"
  | "suspended"
  | "norider"
  | "guest";

export class RiderApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const readError = async (res: Response): Promise<{ message: string; code?: string }> => {
  try {
    const data = (await res.json()) as { error?: string; code?: string };
    return {
      message: data.error || "Something went wrong — please try again.",
      code: typeof data.code === "string" ? data.code : undefined,
    };
  } catch {
    return { message: "Something went wrong — please try again." };
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
    const { message, code } = await readError(res);
    throw new RiderApiError(message, res.status, code);
  }
  return (await res.json()) as T;
};

export const riderErrorMessage = (err: unknown): string =>
  err instanceof RiderApiError
    ? err.message
    : "Something went wrong — please try again.";

export const useRiderSession = () => {
  const [rider, setRider] = useState<Rider | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<RiderSessionStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus((prev) =>
      prev === "authed" || prev === "pending" || prev === "suspended" || prev === "norider"
        ? prev
        : "checking",
    );
    setError(null);
    try {
      const data = await riderFetch<{ rider: Rider; email: string }>(
        "/api/rider/me",
      );
      setRider(data.rider);
      setEmail(data.email);
      setStatus(
        data.rider.status === "active"
          ? "authed"
          : data.rider.status === "suspended"
            ? "suspended"
            : "pending",
      );
    } catch (err) {
      setRider(null);
      setEmail("");
      if (err instanceof RiderApiError && err.status === 403) {
        // Signed in, but this login owns no rider row — the shell points at
        // /rider/apply instead of bouncing back to /rider/login.
        setStatus("norider");
        setError(err.message);
      } else {
        setStatus("guest");
        if (err instanceof RiderApiError && err.status !== 401) {
          setError(err.message);
        }
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

  const signUp = useCallback(
    async (loginEmail: string, password: string): Promise<string | null> => {
      const client = getSupabaseBrowser();
      if (!client) return "Rider sign-up needs Supabase to be configured.";
      const { error: authError } = await client.auth.signUp({
        email: loginEmail.trim(),
        password,
      });
      if (authError) return authError.message;
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

  return { rider, email, status, error, refresh, signIn, signUp, signOut, setAvailability };
};

export const useRiderJobs = (enabled: boolean, riderId?: string | null) => {
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [settlements, setSettlements] = useState<RiderSettlement[]>([]);
  const [pendingClaim, setPendingClaim] = useState<SettleClaim | null>(null);
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
        const [jobsData, settlementsData] = await Promise.all([
          riderFetch<{ jobs: RiderJob[] }>("/api/rider/jobs"),
          riderFetch<{ settlements: RiderSettlement[]; pendingClaim: SettleClaim | null }>(
            "/api/rider/settlements",
          ),
        ]);
        setJobs(jobsData.jobs);
        setSettlements(settlementsData.settlements);
        setPendingClaim(settlementsData.pendingClaim ?? null);
        return true;
      } catch (err) {
        setError(riderErrorMessage(err));
        return false;
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

  /**
   * Mutations return the failure message (null on success) instead of a
   * bare boolean: the page used to read `riderJobsApi.error` from its render
   * closure right after `await`, which is always one render stale — every
   * failed accept/pickup/deliver painted the PREVIOUS error (or nothing).
   */
  const run = async (
    path: string,
    body?: unknown,
  ): Promise<string | null> => {
    try {
      await riderFetch<unknown>(path, "POST", body);
      await refresh();
      setError(null);
      return null;
    } catch (err) {
      // Another rider may have won. Remove stale offers, then retain the
      // conflict message (refresh normally clears errors).
      if (err instanceof RiderApiError && err.status === 409) await refresh();
      const message = riderErrorMessage(err);
      setError(message);
      return message;
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
    async (isOnline: boolean): Promise<string | null> => {
      try {
        await riderFetch("/api/rider/online", "PATCH", { isOnline });
        setError(null);
        return null;
      } catch (err) {
        const message = riderErrorMessage(err);
        setError(message);
        return message;
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
    async (method: string, reference: string): Promise<string | null> => {
      try {
        await riderFetch("/api/rider/settle", "POST", { method, reference });
        setError(null);
        await refresh();
        return null;
      } catch (err) {
        const message = riderErrorMessage(err);
        setError(message);
        return message;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  return { jobs, settlements, pendingClaim, loading, live, error, refresh, accept, pickup, reject, deliver, setOnline, updateLocation, settle };
};
