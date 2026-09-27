/**
 * POST /api/rider/kyc/sign — Cloudinary signature for a KYC photo
 * (round 4, 2026-09-26). Same mechanism as the delivery-proof signature,
 * but open to a pending applicant and pinned to the prosanti/rider-kyc
 * folder. The body is ignored.
 */

import { isCloudinaryConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";
import { riderRoute } from "@/app/api/rider/_lib";
import { signCloudinaryUpload } from "@/lib/cloudinary-sign";

export const dynamic = "force-dynamic";

const KYC_FOLDER = "prosanti/rider-kyc";

export const POST = riderRoute(
  "kyc-sign",
  async () => {
    if (!isCloudinaryConfigured()) {
      return apiError(
        "ছবি আপলোড এখনো কনফিগার করা হয়নি — আবেদন জমা আছে, কাগজপত্র পরে দিলেও চলবে।",
        503,
        { code: "NOT_CONFIGURED" },
      );
    }
    return apiJson(signCloudinaryUpload(KYC_FOLDER, "image"));
  },
  { allowApplicant: true, limit: 20 },
);
