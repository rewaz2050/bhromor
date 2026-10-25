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
import { parseShopFunnel, type ShopFunnel } from "../shop-funnel";
import { isShopFunnelRpc } from "../shop-funnel-rpc-validation";

export class ShopFunnelMissingError extends Error {
  constructor() {
    super(
      "ps_shop_funnel_report is not installed — run migration 202609280004_shop_funnel.sql",
    );
    this.name = "ShopFunnelMissingError";
  }
}

const MISSING_PATTERN =
  /could not find the function[^\n]*\bps_shop_funnel_report\b|function[^\n]*\bps_shop_funnel_report\b[^\n]*does not exist|relation[^\n]*\bstorefront_events\b[^\n]*does not exist/i;

/**
 * One call to ps_shop_funnel_report(p_shop_id, p_days) for THIS shop.
 * Throws ShopFunnelMissingError when the migration is not installed.
 */
export async function shopFunnelReport(
  db: SupabaseClient,
  shopId: string,
  days: 7 | 28,
): Promise<ShopFunnel> {
  if (!shopId)
    throw new Error("A verified shop is required for the funnel report.");
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
      (!code && MISSING_PATTERN.test(message))
    ) {
      throw new ShopFunnelMissingError();
    }
    throw new Error(message || "funnel report failed");
  }
  if (!isShopFunnelRpc(data, shopId, days)) {
    throw new Error("Invalid shop funnel RPC response.");
  }
  return parseShopFunnel(data, days);
}

/**
 * The vendor-facing read: never throws. `missing: true` is reserved for a
 * missing-schema error. A null report with missing=false means unavailable,
 * not a quiet shop. Configuration/RPC failures must never invent zero metrics.
 *
 * `shopId` is always the verified vendor session's shop — the route passes
 * `ctx.shopId`, never anything from the query string.
 */
export async function shopFunnelFor(
  shopId: string,
  days: 7 | 28,
): Promise<{ report: ShopFunnel | null; missing: boolean }> {
  if (!shopId) return { report: null, missing: false };
  let db: SupabaseClient | null = null;
  try {
    const { getSupabaseService } = await import("../supabase-server");
    db = getSupabaseService();
  } catch {
    db = null;
  }
  if (!db) return { report: null, missing: false };
  try {
    return { report: await shopFunnelReport(db, shopId, days), missing: false };
  } catch (err) {
    if (err instanceof ShopFunnelMissingError)
      return { report: null, missing: true };
    // No successful read means no report. The route exposes a retryable 503.
    return { report: null, missing: false };
  }
}
