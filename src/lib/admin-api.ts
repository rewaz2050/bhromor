"use client";

/**
 * Typed fetch helpers for /api/admin/* calls from staff UI hooks.
 * 401 (expired session) signs the admin out so the gate returns to login;
 * every other failure surfaces as an AdminApiError the hook stores.
 */

import { signOutAdmin } from "./admin-auth";
import { getSupabaseBrowser } from "./supabase-browser";

const bearerHeaders = async (
  extra?: HeadersInit,
): Promise<HeadersInit> => {
  const headers = new Headers(extra);
  const client = getSupabaseBrowser();
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
    res = await fetch(path, { cache: "no-store" });
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
