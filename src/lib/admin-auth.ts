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

import { getSupabaseBrowser } from "./supabase-browser";

/**
 * The single real admin (owner) email. Shown as a prefill on the admin
 * login screen; access itself is still granted by the `admin_users` row
 * in Supabase, never by hard-coding credentials.
 */
export const ADMIN_EMAIL = "rahatbd2050@gmail.com";

/**
 * Secret admin login path — security by obscurity layer.
 * The real route lives under this random-looking segment so /admin/login
 * is never exposed. Only staff who know this exact URL can reach the form.
 * Change the suffix here + rename the folder to rotate the path.
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
  if (probe.status === 401 || probe.status === 0) {
    return "Signed in, but the server did not see the session. Redeploy after adding env vars, and set the Site URL in Supabase → Authentication → URL configuration to this Vercel domain.";
  }
  return probe.reason ?? "Staff sign-in failed. Try again.";
};

/**
 * Reconcile the mirrored flag with the server (call on gate mount).
 * Returns the live authed state; clears stale flags on failure.
 */
export const refreshStaffSession = async (): Promise<boolean> => {
  getAdminAuthed();
  const token = await getSupabaseBrowser()
    ?.auth.getSession()
    .then((r) => r.data.session?.access_token)
    .catch(() => undefined);
  const { staff } = await probeStaffSession(token);
  authed = staff;
  if (!staff && typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
  notify();
  return staff;
};

/** Staff sign-in: Supabase Auth + role verification. Never falls back. */
export const signInStaff = async (
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> => {
  const client = getSupabaseBrowser();
  if (!client) return { ok: false, error: "Staff sign-in is not configured." };
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: mapSupabaseAuthError(error.message) };
  // Flush cookies, then probe with the access token so the server does not
  // depend on middleware having already copied the session.
  await client.auth.getSession().catch(() => undefined);
  const probe = await probeStaffSession(data.session?.access_token);
  if (!probe.staff) {
    await client.auth.signOut().catch(() => undefined);
    return { ok: false, error: staffProbeError(probe) };
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
  }
  authed = true;
  mode = "live";
  notify();
  return { ok: true };
};

export const signOutAdmin = (): void => {
  // Best-effort server sign-out; the local flag clears regardless.
  try {
    void getSupabaseBrowser()?.auth.signOut();
  } catch {
    // browser client unavailable — local-only session
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
  authed = false;
  mode = "live";
  notify();
};
