"use client";

/**
 * Typed fetch helpers for /api/admin/* calls from staff UI hooks.
 * 401 (expired session) signs the admin out so the gate returns to login;
 * every other failure surfaces as an AdminApiError the hook stores.
 *
 * Perf (audit 2026-09-17 P2.2/P2.6):
 * - The Supabase browser client is loaded on demand. This module is also
 *   reached from storefront code (`use-cms`, the referral card), and a
 *   static import dragged the whole supabase-js bundle (~250 KB) into the
 *   homepage for visitors who never sign in as staff. The import now runs
 *   only when a staff session flag is present.
 * - GETs carry `Authorization: Bearer` like writes do, so `requireStaff()`
 *   verifies the JWT from the header instead of a cookie → Supabase Auth
 *   round trip on every list fetch.
 */

import { ADMIN_SESSION_KEY, signOutAdmin } from "./admin-auth";

type BrowserClient = import("@supabase/supabase-js").SupabaseClient;

let clientPromise: Promise<BrowserClient | null> | null = null;

/** True when this browser has ever completed a staff sign-in. */
const hasStaffFlag = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(ADMIN_SESSION_KEY) === "1"
    );
  } catch {
    return false;
  }
};

/**
 * Lazily-loaded Supabase browser client. Null for visitors without a staff
 * session flag — they cannot hold a staff JWT, so there is nothing to attach
 * and no reason to download the auth library.
 */
export const loadStaffClient = (): Promise<BrowserClient | null> => {
  if (!hasStaffFlag()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("./supabase-browser")
      .then((m) => m.getSupabaseBrowser())
      .catch(() => null);
  }
  return clientPromise;
};

const bearerHeaders = async (
  extra?: HeadersInit,
): Promise<HeadersInit> => {
  const headers = new Headers(extra);
  const client = await loadStaffClient();
  if (client) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
};

export class AdminApiError extends Error {
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

export const apiGet = async <T>(path: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      headers: await bearerHeaders(),
    });
  } catch {
    throw new AdminApiError("Could not reach the server.", 0);
  }
  if (res.status === 401) {
    signOutAdmin();
    throw new AdminApiError("Session expired — please sign in again.", 401);
  }
  if (!res.ok) throw new AdminApiError(await readError(res), res.status);
  return (await res.json()) as T;
};

export const apiSend = async <T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: await bearerHeaders({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError("Could not reach the server.", 0);
  }
  if (res.status === 401) {
    signOutAdmin();
    throw new AdminApiError("Session expired — please sign in again.", 401);
  }
  if (!res.ok) throw new AdminApiError(await readError(res), res.status);
  return (await res.json()) as T;
};

export const apiErrorMessage = (err: unknown): string =>
  err instanceof AdminApiError
    ? err.message
    : "Something went wrong — please try again.";
