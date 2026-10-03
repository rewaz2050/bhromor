import "server-only";

/** Admin rider profile reader (202610020002). Staff JWT client → SECURITY DEFINER RPC. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import { isMissingDbObject } from "./riders";
import { normalizeOverview, type RiderOverview } from "../rider-risk";

/** null = the migration has not run (the page says which file to run). */
export const getRiderOverview = async (staffDb: SupabaseClient, riderId: string): Promise<RiderOverview | null> => {
  const { data, error } = await staffDb.rpc("ps_admin_rider_overview", { p_rider_id: riderId });
  if (error) {
    if (isMissingDbObject(error)) return null;
    if ((error.message ?? "").includes("rider_not_found")) throw new AdminInputError("Rider not found.", 404);
    if ((error.message ?? "").includes("forbidden")) throw new AdminInputError("Not allowed.", 403);
    throw new Error("rider overview read failed");
  }
  const overview = normalizeOverview(data);
  if (!overview) throw new AdminInputError("Rider not found.", 404);
  return overview;
};
