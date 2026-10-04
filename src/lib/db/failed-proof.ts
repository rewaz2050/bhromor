import "server-only";

/**
 * Failed-delivery proof storage (migration 202610020020). The setting lives in `site_settings`
 * (`failed_delivery_proof`); photos in `delivery_failed_proofs` (staff-readable, never part of the
 * customer's order view). Reads never throw — a missing table/key means "off" / "none".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import {
  FAILED_PROOF_KEY,
  parseFailedProofMode,
  sanitizeFailedProofMode,
  type FailedProofMode,
} from "../failed-proof";

export const readFailedProofMode = async (db: SupabaseClient): Promise<FailedProofMode> => {
  try {
    const { data, error } = await db.from("site_settings").select("value").eq("key", FAILED_PROOF_KEY).maybeSingle();
    if (error || !data) return 0;
    return sanitizeFailedProofMode((data as { value: unknown }).value);
  } catch {
    return 0;
  }
};

export const writeFailedProofMode = async (db: SupabaseClient, raw: unknown): Promise<FailedProofMode> => {
  const { mode, error } = parseFailedProofMode(raw);
  if (error) throw new AdminInputError(error, 422);
  const { error: writeError } = await db
    .from("site_settings")
    .upsert({ key: FAILED_PROOF_KEY, value: mode }, { onConflict: "key" });
  if (writeError) throw new Error("Could not save the failed-delivery photo setting.");
  return mode;
};

/**
 * Remember the photo / "no photo" note of a failed attempt. Called AFTER the attempt is recorded, so a
 * problem here can never undo it: it is logged and swallowed.
 */
export const recordFailedProof = async (
  service: SupabaseClient,
  input: { assignmentId: string; riderId: string; proofUrl: string | null; noPhotoNote: string | null },
): Promise<void> => {
  if (!input.proofUrl && !input.noPhotoNote) return;
  try {
    const { data } = await service
      .from("delivery_assignments")
      .select("order_id")
      .eq("id", input.assignmentId)
      .maybeSingle();
    const orderId = (data as { order_id?: string } | null)?.order_id;
    if (!orderId) return;
    const { error } = await service.from("delivery_failed_proofs").insert({
      order_id: orderId,
      assignment_id: input.assignmentId,
      rider_id: input.riderId,
      photo_url: input.proofUrl,
      no_photo_note: input.proofUrl ? null : input.noPhotoNote,
    });
    if (error) console.error("[rider] could not record the failed-attempt proof", error.message);
  } catch (err) {
    console.error("[rider] could not record the failed-attempt proof", err);
  }
};

export interface FailedProofRow {
  id: string;
  at: string;
  photoUrl: string | null;
  noPhotoNote: string | null;
}

export interface OrderFailedProofs {
  ready: boolean;
  proofs: FailedProofRow[];
}

/** Staff read, through the CALLER's client — the policy `ps_is_admin()` is the gate. */
export const listFailedProofs = async (db: SupabaseClient, orderId: string): Promise<OrderFailedProofs> => {
  const { data, error } = await db
    .from("delivery_failed_proofs")
    .select("id, created_at, photo_url, no_photo_note")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    const msg = typeof error.message === "string" ? error.message.toLowerCase() : "";
    if (code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache")) {
      return { ready: false, proofs: [] };
    }
    throw new Error("Could not read the failed-delivery photos.");
  }
  const rows = (data ?? []) as { id: string; created_at: string; photo_url: string | null; no_photo_note: string | null }[];
  return {
    ready: true,
    proofs: rows.map((r) => ({ id: r.id, at: r.created_at, photoUrl: r.photo_url, noPhotoNote: r.no_photo_note })),
  };
};
