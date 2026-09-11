/**
 * Rider client layer (marketplace phase 3, slice 7+).
 *
 * Session + jobs hooks for /api/rider/*. Live only: an authenticated linked
 * rider sees real jobs, everyone else is routed to /rider/login by the shell.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "./supabase-browser";
import type { Rider } from "./catalog";
import type { RiderJob, RiderSettlement } from "./db/riders";

export class RiderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const readError = async (res: Response): Promise<string> => {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || "Something went wrong — please try again.";
  } catch {
    return "Something went wrong — please try again.";
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
  if (!res.ok) throw new RiderApiError(await readError(res), res.status);
  return (await res.json()) as T;
};

export const riderErrorMessage = (err: unknown): string =>
  err instanceof RiderApiError
    ? err.message
    : "Something went wrong — please try again.";

export const useRiderSession = () => {
  const [rider, setRider] = useState<Rider | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "checking" | "authed" | "guest"
  >("checking");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus((prev) => (prev === "authed" ? prev : "checking"));
    setError(null);
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

  return { rider, email, status, error, refresh, signIn, signUp, signOut };
};

export const useRiderJobs = (enabled: boolean) => {
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [settlements, setSettlements] = useState<RiderSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    setLoading(true);
    setError(null);
    try {
      const [jobsData, settlementsData] = await Promise.all([
        riderFetch<{ jobs: RiderJob[] }>("/api/rider/jobs"),
        riderFetch<{ settlements: RiderSettlement[] }>("/api/rider/settlements"),
      ]);
      setJobs(jobsData.jobs);
      setSettlements(settlementsData.settlements);
      return true;
    } catch (err) {
      setError(riderErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
  }, [enabled, refresh]);

  const run = async (
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    try {
      await riderFetch<unknown>(path, "POST", body);
      await refresh();
      return true;
    } catch (err) {
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
      } catch (err) {
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

  return { jobs, settlements, loading, error, refresh, accept, pickup, reject, deliver, setOnline, updateLocation, settle };
};
