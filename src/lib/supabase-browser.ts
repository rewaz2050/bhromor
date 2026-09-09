"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-based browser client. Sessions live in (httpOnly-readable-by-us)
 * cookies so API routes can authenticate staff through the same session the
 * browser holds — the old localStorage client was invisible to the server.
 * Public anon/publishable key only; RLS still protects data.
 *
 * Note: customers signed in with the previous client get signed out once
 * (different storage); guest data is untouched.
 */

let client: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return (client = null);
  try {
    if (new URL(url).protocol !== "https:") return (client = null);
    client = createBrowserClient(url, key, { auth: { detectSessionInUrl: false } });
  } catch {
    client = null;
  }
  return client;
}
