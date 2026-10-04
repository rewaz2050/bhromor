/**
 * J (2026-10-02) — read/write of the dispatch-rule settings
 * (docs/AUDIT-RIDER-MONEY-2026-09-30.md §22). Pure rules live in
 * `@/lib/dispatch-settings`; this file only talks to `site_settings`.
 * Reads never throw: a missing table/key means "the old default".
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import {
  DISPATCH_DEFAULTS,
  DISPATCH_KEYS,
  parseDispatchSettings,
  sanitizeDispatchSettings,
  type DispatchSettings,
} from "@/lib/dispatch-settings";

export const readDispatchSettings = async (db: SupabaseClient): Promise<DispatchSettings> => {
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("key,value")
      .in("key", Object.values(DISPATCH_KEYS));
    if (error || !data) return DISPATCH_DEFAULTS;
    const raw: Record<string, unknown> = {};
    for (const row of data as { key: string; value: unknown }[]) {
      for (const [field, key] of Object.entries(DISPATCH_KEYS)) {
        if (row.key === key) raw[field] = row.value;
      }
    }
    return sanitizeDispatchSettings(raw);
  } catch {
    return DISPATCH_DEFAULTS;
  }
};

export const writeDispatchSettings = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<DispatchSettings> => {
  const { settings, error } = parseDispatchSettings(raw);
  if (error) throw new AdminInputError(error, 422);
  const rows = Object.entries(DISPATCH_KEYS).map(([field, key]) => ({
    key,
    value: settings[field as keyof DispatchSettings],
  }));
  const { error: writeError } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (writeError) throw new Error("Could not save the dispatch settings.");
  return settings;
};
