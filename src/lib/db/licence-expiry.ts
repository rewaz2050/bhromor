/**
 * Item N — licence expiry: staff record the date, the scheduler enforces it.
 * (Migration 202610020005; every reader here tolerates a missing column.)
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dhakaDateString } from "@/lib/delivery-slots";
import { LICENCE_WARN_DAYS, addDays, isValidLicenceExpiry, licenceStatus, type LicenceStatus } from "@/lib/kyc-expiry";
import { LICENCE_VEHICLES } from "@/lib/rider-kyc";
import { isMissingDbObject, RiderInputError } from "./riders";

export interface RiderLicence {
  riderId: string;
  vehicle: string;
  expiresOn: string | null;
  status: LicenceStatus;
}

const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error && (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? ""));

/** null = the migration is not applied (callers treat that as "no licence tracking"). */
export const getRiderLicence = async (
  db: SupabaseClient,
  riderId: string,
  nowMs = Date.now(),
): Promise<RiderLicence | null> => {
  const { data, error } = await db.from("riders").select("id, vehicle, licence_expires_on").eq("id", riderId).maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return null;
    throw new Error("licence read failed");
  }
  if (!data) throw new RiderInputError("Rider not found.", 404);
  const row = data as { vehicle: string; licence_expires_on: string | null };
  const expiresOn = row.licence_expires_on ? String(row.licence_expires_on).slice(0, 10) : null;
  return {
    riderId,
    vehicle: row.vehicle,
    expiresOn,
    status: licenceStatus(row.vehicle, expiresOn, dhakaDateString(nowMs)),
  };
};

/** Staff: record (or clear, with null) the licence expiry date. */
export const setRiderLicenceExpiry = async (
  db: SupabaseClient,
  riderId: string,
  expiresOn: string | null,
  nowMs = Date.now(),
): Promise<RiderLicence> => {
  const today = dhakaDateString(nowMs);
  if (expiresOn !== null && !isValidLicenceExpiry(expiresOn, today)) {
    throw new RiderInputError("Enter the expiry date from the licence (YYYY-MM-DD).", 422);
  }
  const { data, error } = await db
    .from("riders")
    .update({ licence_expires_on: expiresOn })
    .eq("id", riderId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) {
      throw new RiderInputError("Licence tracking isn't switched on yet — run migration 202610020005 in the Supabase SQL Editor.", 503);
    }
    throw new Error("licence update failed");
  }
  if (!data) throw new RiderInputError("Rider not found.", 404);
  const licence = await getRiderLicence(db, riderId, nowMs);
  if (!licence) throw new Error("licence update failed");
  return licence;
};

/**
 * Going online with a lapsed licence is refused here (friendly message) and by
 * the database trigger (the backstop for direct writes).
 */
export const assertLicenceAllowsOnline = async (
  db: SupabaseClient,
  riderId: string,
  nowMs = Date.now(),
): Promise<void> => {
  let licence: RiderLicence | null = null;
  try {
    licence = await getRiderLicence(db, riderId, nowMs);
  } catch {
    return; // best-effort: the trigger is the hard guard
  }
  if (licence?.status.blocked) {
    throw new RiderInputError(
      "আপনার ড্রাইভিং লাইসেন্সের মেয়াদ শেষ — নবায়ন করে অফিসে নতুন তারিখ জানান, তার আগে অনলাইন হওয়া যাবে না।",
      403,
    );
  }
};

export interface LicenceSweepResult {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

interface SweepRow {
  id: string;
  name: string;
  vehicle: string;
  is_online: boolean;
  licence_expires_on: string;
}

/**
 * Every tick: riders whose licence has lapsed are taken offline (idempotent —
 * nothing else gates them mid-shift), and staff + the rider are told ONCE per
 * rider per date. Marks are optional: without `cron_marks` the offline sweep
 * still runs and the alerts are skipped (never spammed).
 */
export const runLicenceSweep = async (
  service: SupabaseClient,
  nowMs: number,
  deps: {
    claim: (key: string) => Promise<boolean>;
    notifyStaff: (title: string, body: string) => Promise<void>;
    pushRider: (riderId: string, title: string, body: string, important: boolean) => Promise<unknown>;
  },
): Promise<LicenceSweepResult> => {
  const today = dhakaDateString(nowMs);
  const horizon = addDays(today, LICENCE_WARN_DAYS);
  const { data, error } = await service
    .from("riders")
    .select("id, name, vehicle, is_online, licence_expires_on")
    .eq("status", "active")
    .in("vehicle", [...LICENCE_VEHICLES])
    .not("licence_expires_on", "is", null)
    .lte("licence_expires_on", horizon)
    .limit(500);
  if (error) {
    if (isMissingColumn(error) || isMissingDbObject(error)) {
      return { status: "skipped", did: 0, detail: "licence tracking not migrated (202610020005)" };
    }
    return { status: "failed", did: 0, detail: "licence sweep read failed" };
  }
  const rows = ((data ?? []) as SweepRow[]).map((r) => ({
    ...r,
    status: licenceStatus(r.vehicle, String(r.licence_expires_on).slice(0, 10), today),
    on: String(r.licence_expires_on).slice(0, 10),
  }));
  const lapsedOnline = rows.filter((r) => r.status.blocked && r.is_online);
  if (lapsedOnline.length > 0) {
    await service
      .from("riders")
      .update({ is_online: false })
      .in("id", lapsedOnline.map((r) => r.id));
  }

  const told: { name: string; kind: "expired" | "soon"; days: number }[] = [];
  let marksMissing = false;
  for (const r of rows) {
    if (r.status.kind !== "expired" && r.status.kind !== "soon") continue;
    const kind = r.status.kind;
    const key = `licence:${r.id}:${r.on}:${kind}`;
    try {
      if (marksMissing || !(await deps.claim(key))) continue;
    } catch {
      marksMissing = true;
      continue;
    }
    told.push({ name: r.name, kind, days: r.status.daysLeft ?? 0 });
    try {
      await deps.pushRider(
        r.id,
        kind === "expired" ? "লাইসেন্সের মেয়াদ শেষ" : "লাইসেন্স নবায়ন করুন",
        kind === "expired"
          ? "মেয়াদ শেষ হওয়ায় আপনি অনলাইন হতে পারবেন না। নবায়ন করে অফিসে জানান।"
          : `মেয়াদ আর ${r.status.daysLeft} দিন বাকি।`,
        kind === "expired",
      );
    } catch {
      /* push is best-effort */
    }
  }
  if (told.length > 0) {
    const expired = told.filter((t) => t.kind === "expired");
    const soon = told.filter((t) => t.kind === "soon");
    const parts: string[] = [];
    if (expired.length) parts.push(`Expired (taken offline): ${expired.map((t) => t.name).join(", ")}`);
    if (soon.length) parts.push(`Expiring soon: ${soon.map((t) => `${t.name} (${t.days}d)`).join(", ")}`);
    try {
      await deps.notifyStaff(
        `Rider licence: ${expired.length} expired, ${soon.length} expiring`,
        parts.join(". "),
      );
    } catch {
      /* never block the sweep */
    }
  }
  const detail =
    `${lapsedOnline.length} lapsed rider(s) taken offline, ${told.length} alert(s)` +
    (marksMissing ? " (cron_marks missing — alerts skipped)" : "");
  return { status: "ran", did: lapsedOnline.length + told.length, detail };
};
