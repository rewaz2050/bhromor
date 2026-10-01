import { apiJson } from "@/lib/api-response";
import { assignmentOrderRef, deliverRiderAssignment } from "@/lib/db/riders";
import { RiderInputError } from "@/lib/db/riders";
import { recordNoPhotoDelivery } from "@/lib/db/riders";
import { decideProof } from "@/lib/delivery-proof";
import { cloudinaryCloudName, isCloudinaryConfigured } from "@/lib/env";
import { getSupabaseService } from "@/lib/supabase-server";
import { notifyCustomerOfStatus } from "@/lib/customer-push";
import { riderRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/assignments/:id/deliver — customer code + Cloudinary proof. */
export const POST = riderRoute(
  "deliver",
  async (ctx, request, routeContext) => {
    const assignmentId = await routeId(routeContext);
    if (!assignmentId) throw new Error("assignment id required");
    const body = (await request.json().catch(() => null)) as {
      code?: unknown;
      proofUrl?: unknown;
      noPhotoReason?: unknown;
    } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) {
      throw new RiderInputError("Enter the 4-digit delivery code.", 422);
    }
    // N9: proof is checked BEFORE the code, so a missing photo never burns one
    // of the rider's PIN attempts.
    const proof = decideProof({
      proofUrl: body?.proofUrl,
      noPhotoReason: body?.noPhotoReason,
      cloudName: cloudinaryCloudName(),
      uploadsConfigured: isCloudinaryConfigured(),
    });
    if (!proof.ok) throw new RiderInputError(proof.message, 422);
    const { proofUrl, noPhotoReason } = proof;
    await deliverRiderAssignment(ctx.db, assignmentId, code, proofUrl);
    // The last milestone (2026-09-24) — sent after the RPC succeeded, so a
    // wrong code never tells the shopper their parcel arrived.
    const service = getSupabaseService();
    if (service && noPhotoReason) {
      await recordNoPhotoDelivery(service, assignmentId, noPhotoReason);
    }
    if (service) {
      const ref = await assignmentOrderRef(service, assignmentId);
      if (ref) {
        await notifyCustomerOfStatus(service, {
          phone: ref.phone,
          orderNo: ref.orderNo,
          status: "delivered",
          total: ref.total,
        });
      }
    }
    return apiJson({ delivered: true, proofUrl });
  },
);
