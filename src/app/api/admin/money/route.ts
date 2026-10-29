/**
 * Admin → Money (202609300002).
 *
 * GET   — platform money position (ps_admin_money_summary), the rider payout
 *         queue, and the current rider pay rates.
 * POST  — decide one payout request: paid (money left the office) or rejected
 *         (the held amount returns to the rider's wallet). `action: "confirm"`
 *         records the second-Admin half of a four-eyes decision (202610290002).
 * PATCH — save the rider pay rates (per-delivery fee, COD handling fee,
 *         minimum payout) into `site_settings`, where the deliver RPC reads
 *         them with `ps_setting_int`.
 *
 * The payout QUEUE reads RLS-closed tables, so it uses the service client
 * (`staffRoute` has already verified Admin/Super Admin). The two RPCs
 * (summary, decide) gate on `ps_can_manage_finance()` using `auth.uid()`, so they run on the
 * staff member's own JWT client — the service key has no uid and would be
 * refused with "forbidden" every time.
 */
import { apiError, apiJson } from "@/lib/api-response";
import {
  confirmFinanceDecision,
  decideRiderPayout,
  getAdminMoneyPnl,
  getAdminMoneySummary,
  listRiderPayoutQueue,
  readFinanceQuorum,
  readRiderPaySettings,
  writeFinanceQuorum,
  writeRiderPaySettings,
} from "@/lib/db/rider-money";
import { parsePnlRange, pnlWindow } from "@/lib/money-pnl";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../_lib";

/** Admin/super_admin only — see the permission matrix in docs/SECURITY-HARDENING.md. */
const ADMIN_ONLY = ["admin", "super_admin"] as const;

export const dynamic = "force-dynamic";

export const GET = staffRoute("money-read", async ({ db }, request) => {
  const service = getSupabaseService();
  if (!service) return apiError("Service role is not configured.", 503);
  const range = parsePnlRange(new URL(request.url).searchParams.get("range"));
  const [summary, queue, settings, pnl, quorumPaisa] = await Promise.all([
    // The RPC checks ps_can_manage_finance() → needs the actor JWT.
    getAdminMoneySummary(db),
    listRiderPayoutQueue(service),
    readRiderPaySettings(db),
    // Net P&L (202610010003) — null until that file runs; never blocks the page.
    getAdminMoneyPnl(db, pnlWindow(range)).catch((err: unknown) => {
      console.error("[admin/money] pnl failed:", err instanceof Error ? err.message : err);
      return null;
    }),
    // Four-eyes threshold. 0 = off (the default): every decision below keeps
    // its single-Admin behaviour.
    readFinanceQuorum(service),
  ]);
  return apiJson({
    range,
    pnl,
    /** false → 202609300002 has not run; the page explains what to do. */
    ready: summary !== null && queue !== null,
    summary,
    queue,
    settings,
    /** paisa; 0 = four-eyes off. */
    quorumPaisa,
  });
}, { roles: ADMIN_ONLY });

export const POST = staffRoute(
  "money-payout-decide",
  async ({ user, db }, request) => {
    const service = getSupabaseService();
    if (!service) return apiError("Service role is not configured.", 503);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      kind?: unknown;
      ref?: unknown;
      amount?: unknown;
      payoutId?: unknown;
      decision?: unknown;
      note?: unknown;
      reference?: unknown;
    } | null;
    if (body?.action === "confirm") {
      const kinds = ["rider_payout", "rider_settle", "rider_adjust", "rider_dispute"] as const;
      const kind = kinds.find((k) => k === body.kind);
      const ref = typeof body.ref === "string" ? body.ref.trim() : "";
      const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
      if (!kind || !/^[0-9a-f-]{36}$/i.test(ref) || !Number.isFinite(amount) || amount < 0) {
        return apiError("A decision kind, reference and amount are required.", 422);
      }
      await confirmFinanceDecision(db, { kind, ref, amount });
      return apiJson({ ok: true, confirmed: true });
    }
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
    const payout = await decideRiderPayout(db, service, user, {
      payoutId,
      decision,
      note,
      reference,
    });
    return apiJson({ ok: true, payout });
  },
  { limit: 30, roles: ADMIN_ONLY },
);

export const PATCH = staffRoute(
  "money-settings",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as {
      settings?: unknown;
      /** Paisa; 0 (or absent) = four-eyes off. */
      financeQuorumPaisa?: unknown;
    } | null;
    if (body?.financeQuorumPaisa !== undefined) {
      const quorumPaisa = await writeFinanceQuorum(db, body.financeQuorumPaisa);
      return apiJson({ quorumPaisa });
    }
    const settings = await writeRiderPaySettings(db, body?.settings ?? body ?? {});
    return apiJson({ settings });
  },
  { limit: 30, roles: ADMIN_ONLY },
);
