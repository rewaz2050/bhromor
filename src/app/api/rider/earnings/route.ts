/**
 * GET  /api/rider/earnings — the rider's money statement: wallet balance,
 *      today / 7-day / lifetime credits, the kind breakdown, the journal
 *      feed (with public order numbers) and the payout history.
 * POST /api/rider/earnings — file a withdrawal request against the wallet
 *      (the database holds the amount immediately; staff approve or reject).
 *
 * Self-scoped, read-mostly. On a database where 202609300002 has not run the
 * GET answers `ready: false` (no crash, no fake zeros) and the POST refuses
 * with a 503 that names the migration.
 */
import { apiJson } from "@/lib/api-response";
import {
  getRiderMoneySummary,
  listRiderMoneyEntries,
  listRiderPayouts,
  requestRiderPayout,
} from "@/lib/db/rider-money";
import { RiderInputError } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute("earnings", async (ctx) => {
  const [summary, entries, payouts] = await Promise.all([
    // ps_rider_money_summary resolves the rider via auth.uid() → rider JWT client.
    getRiderMoneySummary(ctx.db),
    listRiderMoneyEntries(ctx.service, ctx.rider.id),
    listRiderPayouts(ctx.service, ctx.rider.id),
  ]);
  return apiJson({
    ready: summary !== null,
    summary,
    entries,
    payouts,
    /** Informational only — the wallet itself is not part of this payload. */
    cashInHand: summary?.cashInHand ?? ctx.rider.cashInHand,
  });
});

export const POST = riderRoute(
  "earnings-payout",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as {
      amount?: unknown;
      method?: unknown;
      account?: unknown;
    } | null;
    // Taka → paisa at the edge: the rider types ৳, the database stores paisa.
    const takaAmount =
      typeof body?.amount === "number"
        ? body.amount
        : typeof body?.amount === "string" && body.amount.trim() !== ""
          ? Number(body.amount)
          : Number.NaN;
    if (!Number.isFinite(takaAmount) || takaAmount <= 0) {
      throw new RiderInputError("কত টাকা উত্তোলন করতে চান সেটি সঠিকভাবে লিখুন।", 422);
    }
    const amount = Math.round(takaAmount * 100);
    const method =
      typeof body?.method === "string" ? body.method.trim().toLowerCase().slice(0, 20) : "bkash";
    const account = typeof body?.account === "string" ? body.account.trim().slice(0, 40) : "";
    if (!["bkash", "nagad", "bank", "cash"].includes(method)) {
      throw new RiderInputError("Method must be bkash, nagad, bank or cash.", 422);
    }
    if (method !== "cash" && account.length < 5) {
      throw new RiderInputError("bKash/Nagad/ব্যাংক নম্বর দিন।", 422);
    }
    const payout = await requestRiderPayout(ctx.db, { amount, method, account });
    const summary = await getRiderMoneySummary(ctx.db);
    return apiJson({ requested: true, payout, summary }, 201);
  },
  { limit: 10 },
);
