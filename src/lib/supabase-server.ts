/**
 * Server-side Supabase clients (App Router).
 *
 * - `getSupabaseServer()` — RLS-respecting client bound to the request's
 *   auth cookies. Reads the published catalog exactly as the browser would.
 * - `getSupabaseService()` — service-role client for privileged server work
 *   only: creating guest orders, phone-gated tracking lookups, seeding.
 *   It bypasses RLS by design and must NEVER be constructed in client code.
 *
 * Both return null when the matching env is unconfigured so routes can
 * answer with an honest 503 instead of throwing.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "./env";

/** RLS-respecting client for the current request (reads cookies). */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Route handlers that only read may run in a context where
          // setting cookies is not allowed — safe to ignore there.
        }
      },
    },
  });
}

/**
 * Privileged server client. `server-only` + the `SUPABASE_*` (non-public)
 * env var keep this out of browser bundles; call sites must still be
 * route handlers / server functions, never client components.
 */
export function getSupabaseService(): SupabaseClient | null {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
