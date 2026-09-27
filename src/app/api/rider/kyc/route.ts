/**
 * /api/rider/kyc — the rider's own KYC documents (round 4, 2026-09-26).
 *
 *   GET  → { kyc, submittedAt, required, missing, complete }
 *   POST { doc, url } → same shape after storing one document
 *
 * Open to a PENDING (or rejected, re-applying) rider — this is the one
 * thing an applicant can do before approval. Job and cash routes keep the
 * active-only gate. URLs must be Cloudinary delivery URLs for our cloud,
 * signed via /api/rider/kyc/sign.
 */

import { apiJson } from "@/lib/api-response";
import { getRiderKyc, saveRiderKycDoc } from "@/lib/db/rider-kyc";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute(
  "kyc",
  async (ctx) => apiJson(await getRiderKyc(ctx.service, ctx.rider)),
  { allowApplicant: true, limit: 60 },
);

export const POST = riderRoute(
  "kyc-save",
  async (ctx, request) => {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      doc?: unknown;
      url?: unknown;
    };
    return apiJson(await saveRiderKycDoc(ctx.service, ctx.rider, body));
  },
  { allowApplicant: true, limit: 20 },
);
