/**
 * B5 (2026-09-28) — staff verify a shop, and the trail of who did it.
 *
 * The badge itself is enforced in the database (trigger + check constraint in
 * 202609280005): both documents or no badge, and a shop cannot tick its own
 * boxes. What this module adds is the part a trigger cannot do — remembering
 * WHO decided, WHEN, and what they saw, in an append-only log that survives the
 * badge being taken away and given back.
 *
 * Every write runs on the STAFF client (RLS + role gate in the route), and the
 * actor is the verified staff session — never anything from the request body.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import type { DbShop } from "./types";
import { mapShop } from "./mappers";
import type { Shop } from "../catalog";
import {
  actionFor,
  parseVerificationEvent,
  validateVerificationPatch,
  type VerificationHistory,
} from "../shop-verification";

export interface VerificationActor {
  id: string;
  email?: string | null;
}

/** Postgres 42703 / PostgREST PGRST204 — the migration is not installed. */
const isMissing = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? ""));

const NOT_INSTALLED =
  "Shop verification is not set up on this database yet — run supabase/migrations/202609280005_shop_verification.sql.";

/**
 * Tick what staff actually checked. The badge follows the evidence in the
 * database; this writes the columns AND one append-only line of history.
 *
 * Returns the shop as the admin surface reads it (with the badge), so the row
 * on screen and the row in the database cannot drift apart.
 */
export async function setShopVerification(
  db: SupabaseClient,
  shopId: string,
  raw: unknown,
  actor: VerificationActor,
): Promise<Shop> {
  const checked = validateVerificationPatch(raw);
  if (!checked.ok) throw new AdminInputError(checked.error ?? "Send what was checked.", 422);
  const patch = checked.value;

  const { data: before, error: readError } = await db
    .from("shops")
    .select("nid_checked,trade_licence_checked,verified_at")
    .eq("id", shopId)
    .maybeSingle();
  if (readError || !before) {
    if (isMissing(readError)) throw new AdminInputError(NOT_INSTALLED, 503);
    throw new AdminInputError("That shop is not here.", 404);
  }

  const action = actionFor(
    {
      nid: before.nid_checked === true,
      tradeLicence: before.trade_licence_checked === true,
      ...(before.verified_at ? { verifiedAt: Date.parse(String(before.verified_at)) } : {}),
    },
    patch,
  );

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("shops")
    .update({
      nid_checked: patch.nid,
      trade_licence_checked: patch.tradeLicence,
      verification_note: patch.note || null,
      // The badge is stamped here so the officer is recorded; the trigger
      // clears all three the moment a check is lifted.
      verified_at: patch.nid && patch.tradeLicence ? now : null,
      verified_by: patch.nid && patch.tradeLicence ? actor.id : null,
      verified_by_email:
        patch.nid && patch.tradeLicence ? (actor.email ?? "").trim().toLowerCase() || null : null,
    })
    .eq("id", shopId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissing(error)) throw new AdminInputError(NOT_INSTALLED, 503);
    if (/only staff can verify/i.test(error.message ?? "")) {
      throw new AdminInputError("Only staff can verify a shop.", 403);
    }
    throw new AdminInputError(error.message || "Could not save the verification.", 422);
  }
  if (!data) throw new AdminInputError("That shop is not here.", 404);

  // History is best-effort: a shop's badge must never depend on the log
  // writing. The row above is the truth; this is the memory of it.
  try {
    await db.from("shop_verification_events").insert({
      shop_id: shopId,
      action,
      nid_checked: patch.nid,
      trade_licence_checked: patch.tradeLicence,
      note: patch.note || null,
      actor_id: actor.id,
      actor_email: (actor.email ?? "").trim().toLowerCase() || null,
    });
  } catch {
    /* the badge stands on the shop row, not on the log */
  }

  return mapShop(data as DbShop);
}

/** Staff-only: the officer, the note, and the history of one shop. */
export async function shopVerificationHistory(
  db: SupabaseClient,
  shopId: string,
): Promise<VerificationHistory> {
  const [shopRes, eventsRes] = await Promise.all([
    db
      .from("shops")
      .select("verification_note,verified_by,verified_by_email,verified_at")
      .eq("id", shopId)
      .maybeSingle(),
    db
      .from("shop_verification_events")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (shopRes.error && isMissing(shopRes.error)) {
    throw new AdminInputError(NOT_INSTALLED, 503);
  }
  const row = (shopRes.data ?? {}) as Record<string, unknown>;
  return {
    audit: {
      note: typeof row.verification_note === "string" ? row.verification_note : null,
      by: typeof row.verified_by === "string" ? row.verified_by : null,
      byEmail: typeof row.verified_by_email === "string" ? row.verified_by_email : null,
      at: row.verified_at ? Date.parse(String(row.verified_at)) : null,
    },
    events: ((eventsRes.data ?? []) as Record<string, unknown>[]).map(parseVerificationEvent),
  };
}
