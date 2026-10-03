/**
 * Failed-delivery proof (migration 202610020020). Pure, client-safe.
 *
 * Staff choose whether a rider reporting a failed attempt is asked for a photo:
 *   0 = off (default — nothing changes)   1 = optional (the app offers it)   2 = required.
 * "Required" keeps the same escape hatch as the delivery proof: a dead camera or a Cloudinary outage
 * must not stop a rider reporting honestly, so a written reason (≥ 5 chars) stands in for the photo
 * — and is recorded.
 */

import { isCloudinaryProofUrl } from "./delivery-proof";

export const FAILED_PROOF_KEY = "failed_delivery_proof";

export type FailedProofMode = 0 | 1 | 2;

export const FAILED_PROOF_LABEL: Record<FailedProofMode, string> = {
  0: "Off — riders just write a reason",
  1: "Optional — the rider app offers a photo",
  2: "Required — a photo, or a written reason why none could be taken",
};

/** Lenient read: anything unusable means "off" (the old behaviour). */
export const sanitizeFailedProofMode = (raw: unknown): FailedProofMode => {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return n === 1 || n === 2 ? n : 0;
};

/** Strict read for writes: only 0, 1 or 2. */
export const parseFailedProofMode = (raw: unknown): { mode: FailedProofMode; error?: string } => {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (n === 0 || n === 1 || n === 2) return { mode: n };
  return { mode: 0, error: "Failed-delivery photo must be 0 (off), 1 (optional) or 2 (required)." };
};

export type FailedProofDecision =
  | { ok: true; proofUrl: string | null; noPhotoNote: string | null }
  | { ok: false; message: string };

export const decideFailedProof = (input: {
  mode: FailedProofMode;
  proofUrl: unknown;
  noPhotoReason: unknown;
  cloudName: string | null;
  uploadsConfigured: boolean;
}): FailedProofDecision => {
  if (input.mode === 0) return { ok: true, proofUrl: null, noPhotoNote: null };
  const proofUrl =
    typeof input.proofUrl === "string" && input.proofUrl.trim() ? input.proofUrl.trim().slice(0, 500) : null;
  const note = typeof input.noPhotoReason === "string" ? input.noPhotoReason.trim().slice(0, 200) : "";
  if (proofUrl) {
    if (!isCloudinaryProofUrl(proofUrl, input.cloudName)) {
      return { ok: false, message: "ছবিটি বৈধ নয় — অ্যাপ থেকেই ছবি তুলে আপলোড করুন।" };
    }
    return { ok: true, proofUrl, noPhotoNote: null };
  }
  if (input.mode === 2 && input.uploadsConfigured && note.length < 5) {
    return {
      ok: false,
      message: "ব্যর্থ চেষ্টার ছবি তুলুন (দরজা/গেট/ঠিকানা)। ছবি তোলা না গেলে “ছবি তুলতে পারছি না” চেপে কারণ লিখুন।",
    };
  }
  return { ok: true, proofUrl: null, noPhotoNote: note.length >= 5 ? note : null };
};
