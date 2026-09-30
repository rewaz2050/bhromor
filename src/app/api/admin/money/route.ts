/**
 * Admin → Money (202609300002).
 *
 * GET   — platform money position (ps_admin_money_summary), the rider payout
 *         queue, and the current rider pay rates.
 * POST  — decide one payout request: paid (money left the office) or rejected
 *         (the held amount returns to the rider's wallet).
 * PATCH — save the rider pay rates (per-delivery fee, COD handling fee,
 *         minimum payout) into `site_settings`, where the deliver RPC reads
 *         them with `ps_setting_int`.
 *
 * The summary + payout queue live behind RLS-free, service-only tables/RPCs,
 * so those reads use the service client — `staffRoute` has already verified
 * the caller is staff.
 */
import { apiError, apiJson } from "@/lib/api-response";
import {
  decideRiderPayout,
  getAdminMoneySummary,
  listRiderPayoutQueue,
  readRiderPaySettings,
  writeRiderPaySettings,
} from "@/lib/db/rider-money";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("money-read", async ({ db }) => {
  const service = getSupabaseService();
  if (!service) return apiError("Service role is not configured.", 503);
  const [summary, queue, settings] = await Promise.all([
    getAdminMoneySummary(service),
    listRiderPayoutQueue(service),
    readRiderPaySettings(db),
  ]);
  return apiJson({
    /** false → 202609300002 has not run; the page explains what to do. */
    ready: summary !== null && queue !== null,
    summary,
    queue,
    settings,
  });
});

export const POST = staffRoute(
  "money-payout-decide",
  async ({ user }, request) => {
    const service = getSupabaseService();
    if (!service) return apiError("Service role is not configured.", 503);
    const body = (await request.json().catch(() => null)) as {
      payoutId?: unknown;
      decision?: unknown;
      note?: unknown;
      reference?: unknown;
    } | null;
    const payoutId = typeof body?.payoutId === "string" ? body.payoutId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(payoutId)) {
      return apiError("A valid payout id is required.", 422);
    }
    const decision = body?.decision === "rejected" ? "rejected" : body?.decision === "paid" ? "paid" : null;
    if (!decision) return apiError("Decision must be paid or rejected.", 422);
    const note = typeof body?.note === "string" ? body.note : "";
    const reference = typeof body?.reference === "string" ? body.reference : "";
    if (decision === "paid" && reference.trim().length < 3 && note.trim().length < 3) {
      return apiError("Give the bKash/bank reference (or a note) for the record.", 422);
    }
    const payout = await decideRiderPayout(service, user, {
      payoutId,
      decision,
      note,
      reference,
    });
    return apiJson({ ok: true, payout });
  },
  { limit: 30 },
);

export const PATCH = staffRoute(
  "money-settings",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as {
      settings?: unknown;
    } | null;
    const settings = await writeRiderPaySettings(db, body?.settings ?? body ?? {});
    return apiJson({ settings });
  },
  { limit: 30 },
);
