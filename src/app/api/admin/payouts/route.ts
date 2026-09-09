/**
 * Staff payouts + settlement (marketplace phase 2, slice 5).
 * GET → per-shop balances; ?shop=<id> adds that shop's ledger + payout
 * lines (the settlement report). POST → record a manual payout batch.
 */
import {
  listLedgerLines,
  listPayoutLines,
  listShopBalances,
  recordPayout,
} from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("payouts", async ({ db }, request) => {
  const url = new URL(request.url);
  const shopId = (url.searchParams.get("shop") ?? "").trim().slice(0, 64);
  const balances = await listShopBalances(db);
  if (!shopId) return apiJson({ balances });
  const [ledger, payouts] = await Promise.all([
    listLedgerLines(db, shopId),
    listPayoutLines(db, shopId),
  ]);
  return apiJson({ balances, ledger, payouts });
});

export const POST = staffRoute(
  "payout-record",
  async ({ db, user }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const payout = await recordPayout(db, user.id, body);
    return apiJson({ payout }, 201);
  },
  { limit: 20 },
);
