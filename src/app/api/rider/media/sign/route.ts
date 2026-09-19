/**
 * POST /api/rider/media/sign — Cloudinary signature for a delivery proof
 * photo.
 *
 * The rider app used to call the staff-only /api/media/sign, which answers
 * 403 to a rider session — so every proof upload failed with a misleading
 * "Cloudinary is not configured". This route is rider-gated (riderRoute:
 * active rider + per-rider rate limit) and pins the folder to
 * prosanti/delivery-proofs; the body is ignored.
 */

import { isCloudinaryConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";
import { riderRoute } from "@/app/api/rider/_lib";
import { signCloudinaryUpload } from "@/lib/cloudinary-sign";

export const dynamic = "force-dynamic";

export const PROOF_FOLDER = "prosanti/delivery-proofs";

export const POST = riderRoute(
  "media-sign",
  async () => {
    if (!isCloudinaryConfigured()) {
      return apiError("Photo upload is not configured yet — deliver without a photo.", 503, {
        code: "NOT_CONFIGURED",
      });
    }
    return apiJson(signCloudinaryUpload(PROOF_FOLDER, "image"));
  },
  { limit: 30 },
);
