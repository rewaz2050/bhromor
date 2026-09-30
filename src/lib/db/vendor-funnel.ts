/**
 * B4 (2026-09-28) — the per-shop funnel read (migration 202609280004).
 *
 * `ps_shop_funnel_report` is service-role only (the events table has RLS on and
 * no client policies — nobody's clicks are readable from the browser), so this
 * module opens the service client itself and is the only way in. The shop id is
 * whatever the CALLER passes: the route passes `requireVendor().shopId`, so a
 * vendor session can never ask for another shop's numbers.
 *
 * When the migration has not been applied the function does not exist. That is
 * not an error — the dashboard says "run the migration" instead of printing
 * zeros, which would look like a dead shop.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyShopFunnel,
  parseShopFunnel,
  type ShopFunnel,
} from "../shop-funnel";

export class ShopFunnelMissingError extends Error {
  constructor() {
    super("ps_shop_funnel_report is not installed — run migration 202609280004_shop_funnel.sql");
    this.name = "ShopFunnelMissingError";
  }
}

const MISSING_PATTERN =
  /ps_shop_funnel_report|storefront_events.*does not exist|function .* does not exist/i;

/**
 * One call to ps_shop_funnel_report(p_shop_id, p_days) for THIS shop.
 * Throws ShopFunnelMissingError when the migration is not installed.
 */
export async function shopFunnelReport(
  db: SupabaseClient,
  shopId: string,
  days: 7 | 28,
): Promise<ShopFunnel> {
  if (!shopId) throw new ShopFunnelMissingError();
  const { data, error } = await db.rpc("ps_shop_funnel_report", {
    p_shop_id: shopId,
    p_days: days,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    const message = (error as { message?: string }).message ?? "";
    if (
      code === "PGRST202" ||
      code === "42883" ||
      code === "42P01" ||
      MISSING_PATTERN.test(message)
    ) {
      throw new ShopFunnelMissingError();
    }
    throw new Error(message || "funnel report failed");
  }
  return parseShopFunnel(data, days);
}

/**
 * The vendor-facing read: never throws. `missing: true` means the migration
 * has not been applied (or the service role is unconfigured), which the card
 * says out loud instead of printing zeros as if the shop were empty.
 *
 * `shopId` is always the verified vendor session's shop — the route passes
 * `ctx.shopId`, never anything from the query string.
 */
export async function shopFunnelFor(
  shopId: string,
  days: 7 | 28,
): Promise<{ report: ShopFunnel | null; missing: boolean }> {
  if (!shopId) return { report: null, missing: true };
  let db: SupabaseClient | null = null;
  try {
    const { getSupabaseService } = await import("../supabase-server");
    db = getSupabaseService();
  } catch {
    db = null;
  }
  if (!db) return { report: null, missing: true };
  try {
    return { report: await shopFunnelReport(db, shopId, days), missing: false };
  } catch (err) {
    if (err instanceof ShopFunnelMissingError) return { report: null, missing: true };
    // A real failure is not a dead shop either: show an empty week and let the
    // card's own copy carry the doubt.
    return { report: emptyShopFunnel(days), missing: false };
  }
}
