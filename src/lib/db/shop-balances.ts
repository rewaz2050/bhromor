import "server-only";

/**
 * Shop earned / paid totals, summed IN THE DATABASE (migration 202610020014).
 *
 * Summing fetched rows in Node silently under-counts once a response hits
 * PostgREST's `max_rows` (1,000 by default) — the old `.limit(5000)`, `.limit(100)`
 * and "last 20 payouts" reads all did. A database without the migration falls
 * back to paging through every row, so the figure is right either way.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShopTotals {
  earned: number;
  paid: number;
  lastPayoutAt: number | null;
}

const PAGE = 1000;
const MAX_PAGES = 200; // 200k rows — a hard stop against a runaway loop

const EMPTY: ShopTotals = { earned: 0, paid: 0, lastPayoutAt: null };

/** Page through ALL rows of one column set (ordered, so pages never overlap). */
async function allRows<T>(
  db: SupabaseClient,
  table: "shop_ledger" | "shop_payouts",
  columns: string,
  shopId: string | undefined,
  order: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from(table).select(columns).order(order).order("id");
    if (shopId) q = q.eq("shop_id", shopId);
    const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error("shop balance totals failed");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function shopBalanceTotals(
  db: SupabaseClient,
  shopId?: string,
): Promise<Map<string, ShopTotals>> {
  const totals = new Map<string, ShopTotals>();
  const { data, error } = await db.rpc("ps_shop_balance_totals", {
    p_shop_id: shopId ?? null,
  });
  if (!error && Array.isArray(data)) {
    for (const r of data as {
      shop_id: string;
      earned: number | string;
      paid: number | string;
      last_payout_at: string | null;
    }[]) {
      totals.set(r.shop_id, {
        earned: Number(r.earned ?? 0),
        paid: Number(r.paid ?? 0),
        lastPayoutAt: r.last_payout_at ? Date.parse(r.last_payout_at) : null,
      });
    }
    return totals;
  }

  // Fallback (migration not run yet): page through everything.
  const [ledger, payouts] = await Promise.all([
    allRows<{ shop_id: string; payable: number }>(db, "shop_ledger", "id,shop_id,payable", shopId, "created_at"),
    allRows<{ shop_id: string; amount: number; paid_at: string }>(db, "shop_payouts", "id,shop_id,amount,paid_at", shopId, "paid_at"),
  ]);
  for (const r of ledger) {
    const t = totals.get(r.shop_id) ?? { ...EMPTY };
    t.earned += Number(r.payable ?? 0);
    totals.set(r.shop_id, t);
  }
  for (const r of payouts) {
    const t = totals.get(r.shop_id) ?? { ...EMPTY };
    t.paid += Number(r.amount ?? 0);
    const at = Date.parse(r.paid_at);
    if (Number.isFinite(at) && (t.lastPayoutAt === null || at > t.lastPayoutAt)) t.lastPayoutAt = at;
    totals.set(r.shop_id, t);
  }
  return totals;
}

/** One shop's totals (zeros when it has no rows yet). */
export async function oneShopTotals(db: SupabaseClient, shopId: string): Promise<ShopTotals> {
  return (await shopBalanceTotals(db, shopId)).get(shopId) ?? { ...EMPTY };
}
