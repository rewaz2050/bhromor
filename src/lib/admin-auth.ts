/**
 * Admin session (§47) — demo gate + real staff auth.
 *
 * - Demo mode (Supabase unconfigured): the local credential check shapes
 *   the UI only and is NOT a security boundary.
 * - Live mode: staff sign in with Supabase Auth (email/password); the
 *   session lives in cookies and every /api/admin/* route re-verifies the
 *   JWT + admin_users role. This store only mirrors the outcome for gating.
 */

"use client";

import { getSupabaseBrowser } from "./supabase-browser";
import { isSupabaseConfigured } from "./env";

export const ADMIN_SESSION_KEY = "prosanti.admin.session.v1";
export const ADMIN_MODE_KEY = "prosanti.admin.mode.v1";

/** Demo credentials — used ONLY when Supabase is unconfigured. */
export const DEMO_ADMIN = {
  email: "admin@prosanti.store",
  password: "prosanti",
};

export type AdminMode = "demo" | "live";

/* External store so components can read auth with useSyncExternalStore
 * (hydration-safe, no setState-in-effect lint issues). */
type Listener = () => void;
let authed: boolean | null = null;
let mode: AdminMode | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export const subscribeAdminAuth = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readStored = (): { authed: boolean; mode: AdminMode } => {
  if (typeof window === "undefined") return { authed: false, mode: "demo" };
  const flag = window.localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  const storedMode =
    window.localStorage.getItem(ADMIN_MODE_KEY) === "live" ? "live" : "demo";
  // A stored live flag without Supabase config is stale (keys removed) —
  // never honour it; the backend is demonstrably in demo mode.
  if (storedMode === "live" && !isSupabaseConfigured()) {
    return { authed: false, mode: "demo" };
  }
  return { authed: flag, mode: storedMode };
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
  return mode ?? "demo";
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

export const isDemoAdminAttempt = (email: string, password: string): boolean =>
  email.trim().toLowerCase() === DEMO_ADMIN.email &&
  password === DEMO_ADMIN.password;

export const DEMO_BLOCKED_IN_LIVE =
  "Demo login is off because Supabase is connected. Sign in with a real staff email — create the user in Supabase → Authentication → Users (auto-confirm), then grant admin_users.";

/** Live-mode session probe — the server re-checks role on every call. */
export const probeStaffSession = async (): Promise<StaffProbe> => {
  try {
    const res = await fetch("/api/admin/me", {
      cache: "no-store",
      credentials: "same-origin",
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
  if (mode !== "live") return authed === true;
  const { staff } = await probeStaffSession();
  authed = staff;
  if (!staff && typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.localStorage.setItem(ADMIN_MODE_KEY, "demo");
    mode = "demo";
  }
  notify();
  return staff;
};

export const signInAdmin = (email: string, password: string): boolean => {
  if (
    email.trim().toLowerCase() === DEMO_ADMIN.email &&
    password === DEMO_ADMIN.password
  ) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
      window.localStorage.setItem(ADMIN_MODE_KEY, "demo");
    }
    authed = true;
    mode = "demo";
    notify();
    return true;
  }
  return false;
};

/** Staff sign-in: Supabase Auth + role verification. Never falls back. */
export const signInStaff = async (
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> => {
  if (isDemoAdminAttempt(email, password)) {
    return { ok: false, error: DEMO_BLOCKED_IN_LIVE };
  }
  const client = getSupabaseBrowser();
  if (!client) return { ok: false, error: "Staff sign-in is not configured." };
  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: mapSupabaseAuthError(error.message) };
  // Flush the session cookie before the staff probe hits the server.
  await client.auth.getSession().catch(() => undefined);
  const probe = await probeStaffSession();
  if (!probe.staff) {
    await client.auth.signOut().catch(() => undefined);
    return { ok: false, error: staffProbeError(probe) };
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
    window.localStorage.setItem(ADMIN_MODE_KEY, "live");
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
    window.localStorage.setItem(ADMIN_MODE_KEY, "demo");
  }
  authed = false;
  mode = "demo";
  notify();
};
