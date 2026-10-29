/**
 * Rider client layer (marketplace phase 3, slice 7+).
 *
 * Session + jobs hooks for /api/rider/*. Live only: an authenticated linked
 * rider sees real jobs, everyone else is routed to /rider/login by the shell.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "./supabase-browser";
import { runRiderAuthMutation } from "./rider-auth-lane";
import { usePoll } from "./use-poll";
import { useScopedRead } from "./use-scoped-read";
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
export type RiderDenyReason = "none" | "pending" | "suspended" | "rejected";

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
      data.reason === "pending" || data.reason === "suspended" || data.reason === "rejected" || data.reason === "none"
        ? data.reason
        : undefined;
    return { message: data.error || FALLBACK, reason };
  } catch {
    return { message: FALLBACK };
  }
};

export const riderFetch = async <T,>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
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
  const [session, setSession] = useState<{
    rider: Rider | null;
    email: string;
    status: "checking" | "authed" | "guest";
    error: string | null;
    denyReason: RiderDenyReason | null;
  }>({
    rider: null,
    email: "",
    status: "checking",
    error: null,
    denyReason: null,
  });
  const { rider, email, status, error, denyReason } = session;
  const ownerRef = useRef<{
    active: boolean;
    revision: number;
    authRevision: number;
    identity: string | null;
    signingIn: boolean;
    signingOut: Promise<void> | null;
  } | null>(null);
  useEffect(() => {
    const owner = {
      active: true,
      revision: 0,
      authRevision: 0,
      identity: null as string | null,
      signingIn: false,
      signingOut: null as Promise<void> | null,
    };
    ownerRef.current = owner;
    return () => {
      owner.active = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.signingOut) return;
    // Latest-started probe owns publication; physical HTTP requests are not cancelled.
    const revision = ++owner.revision;
    const current = () =>
      owner.active && ownerRef.current === owner && owner.revision === revision;
    setSession((previous) =>
      current()
        ? {
            ...previous,
            status: previous.status === "authed" ? "authed" : "checking",
            error: null,
            denyReason: null,
          }
        : previous,
    );
    try {
      const data = await riderFetch<{ rider: Rider; email: string }>(
        "/api/rider/me",
      );
      if (current()) owner.identity = data.rider.id;
      if (current())
        setSession((previous) =>
          current()
            ? {
                rider: data.rider,
                email: data.email,
                status: "authed",
                error: null,
                denyReason: null,
              }
            : previous,
        );
    } catch (err) {
      const denied = err instanceof RiderApiError && err.status === 403;
      if (current()) owner.identity = null;
      if (current())
        setSession((previous) =>
          current()
            ? {
                rider: null,
                email: "",
                status: "guest",
                error: denied ? err.message : null,
                denyReason: denied ? (err.reason ?? "none") : null,
              }
            : previous,
        );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const client = getSupabaseBrowser();
    const owner = ownerRef.current;
    if (!owner || !client?.auth.onAuthStateChange) return;
    let live = true;
    let eventGeneration = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (
        !live ||
        !owner.active ||
        ownerRef.current !== owner ||
        event === "INITIAL_SESSION"
      )
        return;
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "TOKEN_REFRESHED" &&
        event !== "USER_UPDATED"
      )
        return;
      if (owner.signingOut && event !== "SIGNED_OUT") return;
      const revision = ++owner.revision;
      const generation = ++eventGeneration;
      if (timer !== null) clearTimeout(timer);
      if (event !== "TOKEN_REFRESHED") {
        // A pending participating login is independently guarded by the SDK lane.
        if (!owner.signingIn) owner.authRevision++;
        owner.identity = null;
        setSession((previous) =>
          live && owner.active && eventGeneration === generation
            ? {
                rider: null,
                email: "",
                status: event === "SIGNED_OUT" ? "guest" : "checking",
                error: null,
                denyReason: null,
              }
            : previous,
        );
      }
      if (event !== "SIGNED_OUT") {
        // Never await SDK/API work inside Supabase's auth callback lock.
        timer = setTimeout(() => {
          if (
            live &&
            owner.active &&
            ownerRef.current === owner &&
            owner.revision === revision &&
            !owner.signingOut
          )
            void refresh();
        }, 0);
      }
    });
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [refresh]);

  const signIn = useCallback(
    async (loginEmail: string, password: string): Promise<string | null> => {
      const owner = ownerRef.current;
      const abandoned = "Sign-in is no longer current — please try again.";
      if (!owner?.active) return abandoned;
      if (owner.signingIn || owner.signingOut) {
        return "A sign-in or sign-out is already in progress.";
      }
      const client = getSupabaseBrowser();
      if (!client) return "Rider sign-in needs Supabase to be configured.";
      owner.signingIn = true;
      const authRevision = ++owner.authRevision;
      const current = () =>
        owner.active &&
        ownerRef.current === owner &&
        owner.authRevision === authRevision &&
        !owner.signingOut;
      try {
        const result = await runRiderAuthMutation(client, current, () =>
          client.auth.signInWithPassword({
            email: loginEmail.trim(),
            password,
          }),
        );
        if (!current() || !result.accepted) return abandoned;
        const { error: authError } = result.value;
        if (authError) return "Email or password did not match.";
        await refresh();
        // null retains its existing meaning: SDK accepted and probe settled,
        // not an independent rider-eligibility or remote-session certificate.
        return current() ? null : abandoned;
      } catch {
        return current()
          ? "Sign-in could not be verified — please try again."
          : abandoned;
      } finally {
        owner.signingIn = false;
      }
    },
    [refresh],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const owner = ownerRef.current;
    if (!owner?.active) return;
    if (owner.signingOut) return owner.signingOut;
    // Invalidate outstanding reads before waiting for remote sign-out. Reads
    // during this wait must not probe credentials which are being removed.
    const revision = ++owner.revision;
    owner.authRevision++;
    const current = () =>
      owner.active && ownerRef.current === owner && owner.revision === revision;
    const pending = Promise.resolve().then(async () => {
      try {
        const client = getSupabaseBrowser();
        if (client)
          await runRiderAuthMutation(
            client,
            () => true,
            () => client.auth.signOut(),
            true,
          ).catch(() => undefined);
      } finally {
        owner.signingOut = null;
        if (current()) owner.identity = null;
        if (current())
          setSession((previous) =>
            current()
              ? {
                  rider: null,
                  email: "",
                  status: "guest",
                  error: null,
                  denyReason: null,
                }
              : previous,
          );
      }
    });
    owner.signingOut = pending;
    await pending;
  }, []);

  const shiftToken = useMemo(
    () => ({ id: status === "authed" ? rider?.id : null }),
    [status, rider?.id],
  );
  const shiftRef = useRef<{
    token: typeof shiftToken;
    active: boolean;
    pending: boolean;
  } | null>(null);
  useEffect(() => {
    const owner = {
      token: shiftToken,
      active: Boolean(shiftToken.id),
      pending: false,
    };
    shiftRef.current = owner;
    return () => {
      owner.active = false;
    };
  }, [shiftToken]);

  /** P2 #22 — save the rider's own shift; auto-dispatch honours it. */
  const setAvailability = useCallback(
    async (payload: {
      fromHour: number | null;
      toHour: number | null;
      days: number[];
    }): Promise<string | null> => {
      const owner = shiftRef.current;
      const sessionOwner = ownerRef.current;
      const authRevision = sessionOwner?.authRevision;
      const abandoned =
        "শিফটের অবস্থা নিশ্চিত করা যায়নি — প্রোফাইল আবার খুলুন।";
      const current = () =>
        owner !== null &&
        owner.active &&
        shiftRef.current === owner &&
        owner.token === shiftToken &&
        sessionOwner !== null &&
        sessionOwner.active &&
        ownerRef.current === sessionOwner &&
        !sessionOwner.signingOut &&
        !sessionOwner.signingIn &&
        sessionOwner.authRevision === authRevision &&
        sessionOwner.identity === shiftToken.id;
      if (!current() || !owner) return abandoned;
      if (owner.pending) return "শিফট সেভ হচ্ছে — একটু অপেক্ষা করুন।";
      owner.pending = true;
      try {
        await riderFetch("/api/rider/availability", "PATCH", payload);
        if (!current()) return abandoned;
        await refresh();
        return current() ? null : abandoned;
      } catch (err) {
        return current() ? riderErrorMessage(err) : abandoned;
      } finally {
        owner.pending = false;
      }
    },
    [refresh, shiftToken],
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

interface RiderJobsToken {
  enabled: boolean;
  riderId: string | null | undefined;
}
interface RiderJobsView {
  token: RiderJobsToken;
  jobs: RiderJob[];
  settlements: RiderSettlement[];
  pendingClaim: SettleClaim | null;
  recentClaims: SettleClaim[];
  claimsReady: boolean;
  loading: boolean;
  error: string | null;
  live: boolean;
}
interface RiderJobsOwner {
  token: RiderJobsToken;
  active: boolean;
  inflight: Promise<boolean> | null;
}
const emptyRiderJobs = (token: RiderJobsToken): RiderJobsView => ({
  token,
  jobs: [],
  settlements: [],
  pendingClaim: null,
  recentClaims: [],
  claimsReady: true,
  loading: false,
  error: null,
  live: false,
});

export const useRiderJobs = (enabled: boolean, riderId?: string | null) => {
  const token = useMemo(() => ({ enabled, riderId }), [enabled, riderId]);
  const ownerRef = useRef<RiderJobsOwner | null>(null);
  const [snapshot, setSnapshot] = useState(() => emptyRiderJobs(token));
  useEffect(() => {
    const owner: RiderJobsOwner = { token, active: enabled, inflight: null };
    ownerRef.current = owner;
    return () => {
      owner.active = false;
    };
  }, [token, enabled]);
  const current = useCallback(
    (owner: RiderJobsOwner | null): owner is RiderJobsOwner =>
      owner !== null &&
      owner.active &&
      owner.token === token &&
      ownerRef.current === owner,
    [token],
  );
  const publish = useCallback(
    (owner: RiderJobsOwner, patch: Partial<Omit<RiderJobsView, "token">>) => {
      if (!current(owner)) return;
      setSnapshot((previous) =>
        current(owner)
          ? {
              ...(previous.token === token ? previous : emptyRiderJobs(token)),
              ...patch,
            }
          : previous,
      );
    },
    [current, token],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    const owner = ownerRef.current;
    if (!current(owner)) return false;
    if (owner.inflight) return owner.inflight;
    const run = (async () => {
      publish(owner, { loading: true, error: null });
      try {
        // Partial side-panel failure must not hide the job feed.
        const [jobsResult, settleResult] = await Promise.allSettled([
          riderFetch<{ jobs: RiderJob[] }>("/api/rider/jobs"),
          riderFetch<{
            settlements: RiderSettlement[];
            pendingClaim: SettleClaim | null;
            claimsReady?: boolean;
            recentClaims?: SettleClaim[];
          }>("/api/rider/settlements"),
        ]);
        if (!current(owner)) return false;
        const patch: Partial<Omit<RiderJobsView, "token">> = {};
        if (jobsResult.status === "fulfilled")
          patch.jobs = jobsResult.value.jobs;
        else patch.error = riderErrorMessage(jobsResult.reason);
        if (settleResult.status === "fulfilled") {
          patch.settlements = settleResult.value.settlements;
          patch.pendingClaim = settleResult.value.pendingClaim ?? null;
          patch.recentClaims = settleResult.value.recentClaims ?? [];
          patch.claimsReady = settleResult.value.claimsReady ?? true;
        } else patch.claimsReady = false;
        publish(owner, patch);
        return jobsResult.status === "fulfilled";
      } finally {
        // This lock belongs only to this owner, never the next rider's read.
        owner.inflight = null;
        publish(owner, { loading: false });
      }
    })();
    owner.inflight = run;
    return run;
  }, [current, publish]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  useEffect(() => {
    const owner = ownerRef.current;
    if (!current(owner) || !riderId) return;
    const client = getSupabaseBrowser();
    if (!client) return;
    let channelActive = true;
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
          if (channelActive && current(owner)) void refresh();
        },
      )
      .subscribe((status) => {
        if (channelActive) publish(owner, { live: status === "SUBSCRIBED" });
      });
    return () => {
      channelActive = false;
      publish(owner, { live: false });
      void client.removeChannel(channel);
    };
  }, [current, publish, riderId, refresh]);
  const view =
    enabled && snapshot.token === token ? snapshot : emptyRiderJobs(token);
  usePoll(
    refresh,
    view.live ? RIDER_JOBS_POLL_BACKUP_MS : RIDER_JOBS_POLL_MS,
    enabled,
  );

  const run = useCallback(
    async (path: string, body?: unknown): Promise<boolean> => {
      const owner = ownerRef.current;
      if (!current(owner)) return false;
      try {
        await riderFetch<unknown>(path, "POST", body);
        if (!current(owner)) return false;
        await refresh();
        return current(owner);
      } catch (err) {
        if (!current(owner)) return false;
        // Retain current conflict policy: refresh stale offers before the error.
        if (err instanceof RiderApiError && err.status === 409) await refresh();
        publish(owner, { error: riderErrorMessage(err) });
        return false;
      }
    },
    [current, publish, refresh],
  );
  const accept = useCallback(
    (id: string) =>
      run(`/api/rider/assignments/${encodeURIComponent(id)}/accept`),
    [run],
  );
  const pickup = useCallback(
    (id: string) =>
      run(`/api/rider/assignments/${encodeURIComponent(id)}/pickup`),
    [run],
  );
  const reject = useCallback(
    (id: string) =>
      run(`/api/rider/assignments/${encodeURIComponent(id)}/reject`),
    [run],
  );
  const deliver = useCallback(
    (
      id: string,
      code: string,
      proofUrl?: string | null,
      noPhotoReason?: string | null,
    ) =>
      run(`/api/rider/assignments/${encodeURIComponent(id)}/deliver`, {
        code,
        proofUrl,
        ...(noPhotoReason ? { noPhotoReason } : {}),
      }),
    [run],
  );
  const setOnline = useCallback(
    async (isOnline: boolean): Promise<boolean> => {
      const owner = ownerRef.current;
      if (!current(owner)) return false;
      try {
        await riderFetch("/api/rider/online", "PATCH", { isOnline });
        if (!current(owner)) return false;
        publish(owner, { error: null });
        return true;
      } catch (err) {
        publish(owner, { error: riderErrorMessage(err) });
        return false;
      }
    },
    [current, publish],
  );
  const updateLocation = useCallback(
    async (lat: number, lng: number): Promise<boolean> => {
      const owner = ownerRef.current;
      if (!current(owner)) return false;
      try {
        await riderFetch("/api/rider/location", "PATCH", { lat, lng });
        if (!current(owner)) return false;
        publish(owner, { error: null });
        return true;
      } catch {
        return false;
      } // Location failure remains silent.
    },
    [current, publish],
  );
  const settle = useCallback(
    async (method: string, reference: string): Promise<boolean> => {
      const owner = ownerRef.current;
      if (!current(owner)) return false;
      try {
        await riderFetch("/api/rider/settle", "POST", { method, reference });
        if (!current(owner)) return false;
        publish(owner, { error: null });
        await refresh();
        return current(owner);
      } catch (err) {
        publish(owner, { error: riderErrorMessage(err) });
        return false;
      }
    },
    [current, publish, refresh],
  );
  return {
    jobs: view.jobs,
    settlements: view.settlements,
    pendingClaim: view.pendingClaim,
    recentClaims: view.recentClaims,
    claimsReady: view.claimsReady,
    loading: view.loading,
    live: view.live,
    error: view.error,
    refresh,
    accept,
    pickup,
    reject,
    deliver,
    setOnline,
    updateLocation,
    settle,
  };
};

export interface RiderStatsView {
  totalDeliveries: number;
  weekDeliveries: number;
  ratingAvg: number;
  ratingCount: number;
  /** 202609300001 — platform wallet (tips, later fees); absent pre-migration. */
  earningsBalance?: number;
  /** Today (Dhaka) — deliveries completed and what they credited; absent when unavailable. */
  todayDeliveries?: number;
  todayEarned?: number;
  /** J — the dispatch cash cap (paisa), admin-editable; absent on an old server. */
  cashLimit?: number;
}

/**
 * The rider's scoreboard (202609250008). Fetched once per app open (not with
 * the 15 s job poll — these numbers do not change that fast); `refresh`
 * re-reads after a delivery or a settle, when the numbers actually move.
 */
const readRiderStats = async (path: string): Promise<RiderStatsView> => {
  const { stats } = await riderFetch<{ stats: RiderStatsView }>(path);
  // Preserve the existing last-verified-data rule for malformed responses.
  if (!stats || ![stats.totalDeliveries, stats.weekDeliveries, stats.ratingAvg, stats.ratingCount].every(Number.isFinite)) {
    throw new Error("Invalid rider scoreboard");
  }
  return stats;
};
const silentStatsError = () => "Scoreboard unavailable";

export const useRiderStats = (enabled: boolean) => {
  const resource = useScopedRead("/api/rider/stats", enabled, readRiderStats, silentStatsError);
  // Decoration only: a failed read never adds a job-board error banner.
  return { stats: resource.data, loading: resource.loading, refresh: resource.reload };
};
