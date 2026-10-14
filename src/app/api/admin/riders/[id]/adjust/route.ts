/**
 * POST /api/admin/riders/:id/adjust — manual wallet credit/debit (item W).
 * { amountTaka: signed non-zero, note: reason ≥ 5 chars }. Never overdraws the
 * wallet; the journal row (kind 'adjustment') and the money audit log carry the
 * staff member's identity and the reason. The rider is told in their inbox + push.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { adjustRiderWallet } from "@/lib/db/rider-disputes";
import { postAnnouncement } from "@/lib/db/rider-inbox";
import { adjustmentMessage, parseAdjustInput } from "@/lib/rider-disputes";
import { pushRiderAnnouncement } from "@/lib/rider-push";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute, routeId } from "../../../_lib";

/** Admin/super_admin only — see the permission matrix in docs/SECURITY-HARDENING.md. */
const ADMIN_ONLY = ["admin", "super_admin"] as const;

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "rider-adjust",
  async ({ db }, request, context) => {
    const id = await routeId(context);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("A valid rider id is required.", 422);
    const input = parseAdjustInput(await request.json().catch(() => null));
    if ("error" in input) return apiError(input.error, 422);
    const entry = await adjustRiderWallet(db, id, input);
    try {
      const msg = adjustmentMessage(input.amount, input.note);
      await postAnnouncement(db, { title: msg.title, body: msg.body, severity: "info", riderId: id, expiresHours: 24 * 14 });
      const service = getSupabaseService();
      if (service) await pushRiderAnnouncement(service, { riderId: id, title: msg.title, body: msg.body, important: false });
    } catch {
      /* best-effort */
    }
    return apiJson({ entry }, 201);
  },
  { limit: 20, roles: ADMIN_ONLY },
);
