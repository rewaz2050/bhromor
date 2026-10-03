/**
 * POST /api/admin/rider-disputes/:id — decide a dispute (item W).
 * { decision: "approve" | "reject", amountTaka?: signed, note }. Approve with an
 * amount credits/debits the rider's wallet (journalled + audited under the staff
 * member's own JWT); reject needs a reason. The rider is told in their inbox + push.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { resolveDispute } from "@/lib/db/rider-disputes";
import { postAnnouncement } from "@/lib/db/rider-inbox";
import { disputeDecisionMessage, parseResolveInput } from "@/lib/rider-disputes";
import { pushRiderAnnouncement } from "@/lib/rider-push";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute, routeId } from "../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "rider-dispute-resolve",
  async ({ db }, request, context) => {
    const id = await routeId(context);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("A valid dispute id is required.", 422);
    const input = parseResolveInput(await request.json().catch(() => null));
    if ("error" in input) return apiError(input.error, 422);
    const dispute = await resolveDispute(db, id, input);
    // The decision stands even if telling the rider fails.
    try {
      const msg = disputeDecisionMessage(input.decision, dispute.adjustmentAmount, input.note);
      await postAnnouncement(db, { title: msg.title, body: msg.body, severity: "info", riderId: dispute.riderId, expiresHours: 24 * 14 });
      const service = getSupabaseService();
      if (service) await pushRiderAnnouncement(service, { riderId: dispute.riderId, title: msg.title, body: msg.body, important: false });
    } catch {
      /* best-effort */
    }
    return apiJson({ dispute });
  },
  { limit: 30 },
);
