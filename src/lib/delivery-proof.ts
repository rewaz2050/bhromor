/**
 * Delivery-proof photo rules (audit N9, 2026-10-01).
 *
 * The rider app uploads the photo straight to OUR Cloudinary cloud with a
 * signature from /api/rider/media/sign, then sends the resulting URL with the
 * delivery code. Until now the server accepted ANY https URL, so a rider could
 * "prove" a delivery with a stock photo link. A proof must now live in this
 * shop's own cloud.
 *
 * (The folder is deliberately NOT part of the check: Cloudinary accounts in
 * "dynamic folder" mode keep the upload folder out of the public URL.)
 */

export const PROOF_FOLDER = "prosanti/delivery-proofs";

/** True for an https://res.cloudinary.com/<our cloud>/... URL. */
export const isCloudinaryProofUrl = (
  url: string,
  cloudName: string | null,
): boolean => {
  if (!cloudName) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "res.cloudinary.com" &&
    !parsed.username &&
    !parsed.password &&
    parsed.pathname.toLowerCase().startsWith(`/${cloudName.toLowerCase()}/`)
  );
};

export type ProofDecision =
  | { ok: true; proofUrl: string | null; noPhotoReason: string | null }
  | { ok: false; message: string };

/**
 * Decide, BEFORE the customer code is checked (so a missing photo never burns
 * a PIN attempt), whether this delivery request carries acceptable proof.
 *
 * - a URL must be ours (Cloudinary, this cloud);
 * - no URL → a photo is required whenever uploads are configured, unless the
 *   rider states why none could be taken (≥ 5 chars) — a dead phone camera or
 *   a Cloudinary outage must not strand a parcel, but it is recorded;
 * - uploads not configured → a photo is impossible, so it is not demanded.
 */
export const decideProof = (input: {
  proofUrl: unknown;
  noPhotoReason: unknown;
  cloudName: string | null;
  uploadsConfigured: boolean;
}): ProofDecision => {
  const proofUrl =
    typeof input.proofUrl === "string" && input.proofUrl.trim()
      ? input.proofUrl.trim().slice(0, 500)
      : null;
  const reason =
    typeof input.noPhotoReason === "string"
      ? input.noPhotoReason.trim().slice(0, 200)
      : "";
  if (proofUrl) {
    if (!isCloudinaryProofUrl(proofUrl, input.cloudName)) {
      return {
        ok: false,
        message:
          "প্রুফ ছবিটি বৈধ নয় — অ্যাপ থেকেই ছবি তুলে আপলোড করুন।",
      };
    }
    return { ok: true, proofUrl, noPhotoReason: null };
  }
  if (input.uploadsConfigured) {
    if (reason.length < 5) {
      return {
        ok: false,
        message:
          "ডেলিভারির প্রুফ ছবি তুলুন। ছবি তোলা বা আপলোড করা না গেলে “ছবি তুলতে পারছি না” চেপে কারণ লিখুন।",
      };
    }
    return { ok: true, proofUrl: null, noPhotoReason: reason };
  }
  return { ok: true, proofUrl: null, noPhotoReason: null };
};
