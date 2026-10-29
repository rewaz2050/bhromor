import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbRider } from "./types";

/** Actor-bound projection: Admin / self wallet only; never a service fallback. */
export async function readRiderRow(db: SupabaseClient, id: string): Promise<DbRider> {
  const { data, error } = await db.rpc("ps_read_riders").eq("id", id).single();
  if (error || !data) throw new Error("Authorized rider read failed; verify rider wallet privacy migration.");
  return data as DbRider;
}
