/**
 * Rider KYC persistence (round 4, 2026-09-26).
 *
 * The rider's own session is verified by the route (requireRider with
 * allowApplicant), then the document URL is written with the SERVICE role:
 * a rider's direct write to `riders` may only flip is_online (trigger
 * whitelist), and that stays true. Only Cloudinary URLs for our cloud are
 * accepted, one per document id; `kyc_submitted_at` is stamped the first
 * time every required document is present.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rider } from "../catalog";
import { cloudinaryCloudName } from "../env";
import {
  isAcceptableKycUrl,
  isKycDocId,
  kycProgress,
  normalizeKyc,
  type KycDocId,
  type RiderKyc,
} from "../rider-kyc";
import { RiderInputError } from "./riders";

export interface RiderKycState {
  kyc: RiderKyc;
  submittedAt: number | null;
  required: KycDocId[];
  missing: KycDocId[];
  complete: boolean;
}

const stateOf = (kyc: RiderKyc, submittedAt: string | null | undefined, vehicle: string): RiderKycState => {
  const progress = kycProgress(kyc, vehicle);
  return {
    kyc,
    submittedAt: submittedAt ? Date.parse(submittedAt) : null,
    required: progress.required,
    missing: progress.missing,
    complete: progress.complete,
  };
};

/** Postgres 42703 / PostgREST PGRST204 — the column is not there yet. */
const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? ""));

export const KYC_NOT_READY =
  "কাগজপত্র আপলোড এখনো চালু হয়নি (ডেটাবেস আপডেট বাকি) — অ্যাডমিনকে জানান, আবেদন ঠিকই জমা আছে।";

export async function getRiderKyc(service: SupabaseClient, rider: Rider): Promise<RiderKycState> {
  const { data, error } = await service
    .from("riders")
    .select("kyc,kyc_submitted_at")
    .eq("id", rider.id)
    .single();
  if (error) {
    if (isMissingColumn(error)) throw new RiderInputError(KYC_NOT_READY, 503);
    throw new Error("rider kyc read failed");
  }
  const row = data as { kyc?: unknown; kyc_submitted_at?: string | null };
  return stateOf(normalizeKyc(row.kyc), row.kyc_submitted_at, rider.vehicle);
}

export async function saveRiderKycDoc(
  service: SupabaseClient,
  rider: Rider,
  raw: { doc?: unknown; url?: unknown },
): Promise<RiderKycState> {
  if (!isKycDocId(raw.doc)) {
    throw new RiderInputError("কোন কাগজটি আপলোড করছেন তা বোঝা যায়নি — আবার চেষ্টা করুন।");
  }
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!isAcceptableKycUrl(url, cloudinaryCloudName())) {
    throw new RiderInputError("ছবিটি ঠিকমতো আপলোড হয়নি — আবার তুলে পাঠান।");
  }
  const current = await getRiderKyc(service, rider);
  const next: RiderKyc = { ...current.kyc, [raw.doc]: url };
  const progress = kycProgress(next, rider.vehicle);
  const patch: Record<string, unknown> = { kyc: next };
  if (progress.complete && !current.submittedAt) {
    patch.kyc_submitted_at = new Date().toISOString();
  }
  const { data, error } = await service
    .from("riders")
    .update(patch)
    .eq("id", rider.id)
    .select("kyc,kyc_submitted_at")
    .single();
  if (error || !data) {
    if (isMissingColumn(error)) throw new RiderInputError(KYC_NOT_READY, 503);
    throw new Error("rider kyc write failed");
  }
  const row = data as { kyc?: unknown; kyc_submitted_at?: string | null };
  return stateOf(normalizeKyc(row.kyc), row.kyc_submitted_at, rider.vehicle);
}
