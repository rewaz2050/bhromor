import "server-only";

/**
 * Daily "you owe PROSANTI" reminder to shops (2026-10-03).
 *
 * A shop on the shop-own-wallet model takes the customer's bKash/Nagad money itself, so it
 * can end up owing PROSANTI the commission + delivery charge + tip (a negative payable — see
 * `ps_shop_balance_totals`). Staff used to chase these by phone. Now the shop's own device
 * gets one push a day while the debt is at least ৳100.
 *
 * Safe by construction:
 *   • only shops that OWE are touched — on a deployment with no shop-wallet shops nothing is
 *     ever sent, so there is no setting to forget;
 *   • one push per shop per Dhaka day (a `cron_marks` row), between 10:00 and 20:00 Dhaka;
 *   • at most 50 shops per tick; a shop with no registered device simply gets nothing;
 *   • best-effort — a failure is a line in the cron report, never a crash.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dhakaDateString, dhakaParts } from "../delivery-slots";
import { owesPayload, pushVendorShops } from "../vendor-push";
import { shopBalanceTotals } from "./shop-balances";

/** Debts under ৳100 are not worth a daily buzz. */
export const SHOP_OWES_MIN_PAISA = 10_000;
export const SHOP_OWES_FROM_HOUR = 10;
export const SHOP_OWES_TO_HOUR = 20;
const MAX_SHOPS_PER_TICK = 50;

export interface ShopOwesSweepResult {
  status: "ran" | "skipped" | "failed";
  did: number;
  detail: string;
}

export interface ShopOwesDeps {
  /** True = this tick owns the (shop, day) reminder; throws when marks are missing. */
  claim: (key: string) => Promise<boolean>;
}

export const runShopOwesReminder = async (
  service: SupabaseClient,
  nowMs: number,
  deps: ShopOwesDeps,
): Promise<ShopOwesSweepResult> => {
  const hour = dhakaParts(nowMs).hour;
  if (hour < SHOP_OWES_FROM_HOUR || hour >= SHOP_OWES_TO_HOUR) {
    return { status: "skipped", did: 0, detail: "outside the reminder hours" };
  }
  const totals = await shopBalanceTotals(service);
  const owing = [...totals.entries()]
    .map(([shopId, t]) => ({ shopId, owed: Math.round(t.paid - t.earned) }))
    .filter((s) => s.owed >= SHOP_OWES_MIN_PAISA)
    .sort((a, b) => b.owed - a.owed)
    .slice(0, MAX_SHOPS_PER_TICK);
  if (owing.length === 0) return { status: "skipped", did: 0, detail: "no shop owes PROSANTI" };

  const day = dhakaDateString(nowMs);
  let reached = 0;
  let claimed = 0;
  for (const shop of owing) {
    if (!(await deps.claim(`shop-owes:${shop.shopId}:${day}`))) continue;
    claimed += 1;
    if ((await pushVendorShops(service, [shop.shopId], owesPayload(shop.owed), 12 * 3600)) > 0) reached += 1;
  }
  if (claimed === 0) return { status: "skipped", did: 0, detail: "already reminded today" };
  return { status: "ran", did: reached, detail: `${owing.length} shop(s) owe PROSANTI; reminded ${reached} device-holder(s) (${claimed} new today)` };
};
