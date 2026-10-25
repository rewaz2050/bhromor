/**
 * Admin session (§47) — real staff auth only.
 *
 * Staff sign in with Supabase Auth (email/password); the session lives in
 * cookies and every /api/admin/* route re-verifies the JWT + admin_users
 * role. This store only mirrors the outcome for gating the admin UI.
 *
 * The admin channel is 100% real. A staffer must exist in Supabase
 * Authentication AND have an `admin_users` row (see scripts/grant-admin.mjs).
 */

"use client";

import { runBrowserAuthMutation } from "./rider-auth-lane";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Perf (audit 2026-09-17 P2.2): the Supabase browser client is loaded on
 * demand. This module sits on the storefront's import graph (via
 * `admin-api` → `use-cms` / the referral card), and a static import shipped
 * the whole supabase-js bundle to every visitor. Staff sign-in and the
 * session refresh are the only callers, and they can await the import.
 */
const browserClient = (): Promise<SupabaseClient | null> =>
  import("./supabase-browser")
    .then((m) => m.getSupabaseBrowser())
    .catch(() => null);

/**
 * Secret admin login path — security by obscurity layer ONLY (the real lock
 * is the Supabase JWT + `admin_users` role on every API route).
 * The real route lives under this random-looking segment so /admin/login
 * is never exposed. Change the suffix here + rename the folder to rotate the path.
 *
 * Security 2026-10-14 (M4): this constant and the owner's email used to be
 * exported here — and `admin-api.ts` (reached from storefront code) pulled
 * the whole module into public bundles, advertising both. The email prefill
 * is gone entirely (it was a phishing target); keep this module out of
 * storefront import graphs — `admin-api` loads it lazily on 401 only.
 */
export const ADMIN_LOGIN_PATH = "/admin/ops-gate-7f3a9c";

export const ADMIN_SESSION_KEY = "prosanti.admin.session.v1";

export type AdminMode = "live";

/* External store so components can read auth with useSyncExternalStore
 * (hydration-safe, no setState-in-effect lint issues). */
type Listener = () => void;
let authed: boolean | null = null;
let mode: AdminMode = "live";
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export const subscribeAdminAuth = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readStored = (): { authed: boolean; mode: AdminMode } => {
  if (typeof window === "undefined") return { authed: false, mode: "live" };
  const flag = window.localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  return { authed: flag, mode: "live" };
};

export const getAdminAuthed = (): boolean => {
  if (authed === null) {
    const stored = readStored();
    authed = stored.authed;
    mode = stored.mode;
  }
  return authed;
};

export const getAdminMode = (): AdminMode => {
  getAdminAuthed();
  return mode;
};

export const isAdminAuthed = (): boolean => getAdminAuthed();

export type StaffProbe = {
  staff: boolean;
  role?: string;
  status: number;
  reason?: string;
};

/** Map a Supabase Auth error into a staff-login explanation. */
export const mapSupabaseAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("email not confirmed")) {
    return "This email is not confirmed yet. In Supabase → Authentication → Users, open the user and confirm the email (or disable Confirm email).";
  }
  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("invalid_credentials")
  ) {
    return "Incorrect email or password.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Could not reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and that the project is not paused.";
  }
  return "Incorrect email or password.";
};

/** Live-mode session probe — the server re-checks role on every call. */
export const probeStaffSession = async (
  accessToken?: string,
): Promise<StaffProbe> => {
  try {
    const headers: HeadersInit = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch("/api/admin/me", {
      cache: "no-store",
      credentials: "same-origin",
      headers,
    });
    const data = (await res.json().catch(() => ({}))) as {
      staff?: boolean;
      role?: string;
      reason?: string;
    };
    if (res.ok && data.staff) {
      return { staff: true, role: data.role, status: res.status };
    }
    return {
      staff: false,
      status: res.status,
      reason: data.reason,
    };
  } catch {
    return { staff: false, status: 0, reason: "Could not reach the server." };
  }
};

export const staffProbeError = (probe: StaffProbe): string => {
  if (probe.status === 403) {
    return "This account signed in, but it is not staff. In the Supabase SQL editor run: insert into admin_users (id, role) select id, 'admin' from auth.users where email = 'YOUR_EMAIL';";
  }
  if (probe.status === 401) {
    return "Signed in, but the server did not see the session. Redeploy after adding env vars, and set the Site URL in Supabase → Authentication → URL configuration to this Vercel domain.";
  }
  if (probe.status === 0) {
    return "Could not reach the server to verify the staff session. Check the connection and retry.";
  }
  if (probe.status >= 500) {
    return `The server failed while verifying the staff session (HTTP ${probe.status}). Retry; if it persists check the deployment logs.`;
  }
  return probe.reason ?? "Staff sign-in failed. Try again.";
};

/**
 * Reconcile the mirrored flag with the server (call on gate mount).
 * Returns the live authed state; clears stale flags on failure.
 */
export const refreshStaffSession = async (): Promise<boolean> => {
  const revision = staffAuthRevision;
  getAdminAuthed();
  // Visitors without the staff flag cannot hold a staff JWT — skip the auth
  // library download entirely and let the cookie-less probe answer 401.
  const client = authed ? await browserClient() : null;
  const token = await client?.auth
    .getSession()
    .then((r) => r.data.session?.access_token)
    .catch(() => undefined);
  if (staffAuthRevision !== revision) return false;
  const { staff } = await probeStaffSession(token);
  if (staffAuthRevision !== revision) return false;
  authed = staff;
  if (!staff && typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
  notify();
  return staff;
};

let staffAuthRevision = 0;
let staffSigningIn = 0;

/** Staff SDK login AND role verification share the mutation lane. */
export const signInStaff = async (
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> => {
  const revision = ++staffAuthRevision;
  staffSigningIn++;
  const stale = {
    ok: false,
    error: "Sign-in is no longer current — please try again.",
  };
  try {
    const client = await browserClient();
    if (!client)
      return { ok: false, error: "Staff sign-in is not configured." };
    const result = await runBrowserAuthMutation(
      client,
      () => staffAuthRevision === revision,
      async (current) => {
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!current()) return stale;
        if (error)
          return { ok: false, error: mapSupabaseAuthError(error.message) };
        await client.auth.getSession().catch(() => undefined);
        if (!current()) return stale;
        const probe = await probeStaffSession(data.session?.access_token);
        if (!current()) return stale;
        if (!probe.staff) {
          await client.auth.signOut().catch(() => undefined);
          return { ok: false, error: staffProbeError(probe) };
        }
        if (typeof window !== "undefined")
          window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
        authed = true;
        mode = "live";
        notify();
        return { ok: true };
      },
    );
    return result.accepted ? result.value : stale;
  } catch {
    return {
      ok: false,
      error: "Staff sign-in could not be verified — please try again.",
    };
  } finally {
    staffSigningIn--;
  }
};

export const signOutAdmin = (): void => {
  // Best-effort server sign-out; the local flag clears regardless. Only a
  // browser that actually held a staff session needs the auth library.
  const needsSdkLogout = authed || staffSigningIn > 0;
  staffAuthRevision++;
  if (needsSdkLogout) {
    void browserClient()
      .then((client) =>
        client
          ? runBrowserAuthMutation(
              client,
              () => true,
              () => client.auth.signOut(),
              true,
            )
          : undefined,
      )
      .catch(() => undefined);
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
  authed = false;
  mode = "live";
  notify();
};
