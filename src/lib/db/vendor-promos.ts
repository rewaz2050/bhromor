/**
 * B3 (2026-09-28) — the shop's own promo codes: read, create, pause.
 *
 * Writes go through the VENDOR's client, so the `coupons vendor *` policies and
 * `ps_guard_vendor_promo` (202609280003) are the authority: a shop can only
 * touch its own rows, only within the platform caps, and never by hand-editing
 * the redemption counter. This module adds the readable refusal in front of
 * that (`validateVendorPromo`) and the numbers the screen shows.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError } from "./admin";
import type { DbCoupon } from "./types";
import { mapCoupon } from "./mappers";
import type { Coupon } from "../coupons";
import {
  DEFAULT_PROMO_LIMITS,
  promoLimitsFrom,
  validateVendorPromo,
  type PromoLimits,
} from "../vendor-promo";

export interface VendorPromo extends Coupon {
  /** The shop that owns the code — always this shop for a vendor read. */
  shopId?: string;
  createdBy?: string;
  /** Epoch ms of creation (absent on pre-202609280003 rows). */
  createdAt?: number;
}

export interface PromoBoard {
  promos: VendorPromo[];
  limits: PromoLimits;
  /** Redemptions across the shop's codes so far. */
  usedTotal: number;
  /**
   * Paisa the shop's own codes have taken off its share (from shop_ledger) —
   * the real cost of its marketing, not an estimate.
   */
  discountBornePaisa: number;
}

/** The platform caps. Never throws: an unreadable table means the defaults. */
export async function readPromoLimits(db: SupabaseClient): Promise<PromoLimits> {
  try {
    const { data, error } = await db
      .from("vendor_promo_limits")
      .select("max_percent,max_discount,max_days,max_usage,max_active")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_PROMO_LIMITS;
    return promoLimitsFrom(data);
  } catch {
    return DEFAULT_PROMO_LIMITS;
  }
}

const mapPromo = (row: DbCoupon & { shop_id?: string | null; created_by?: string | null; created_at?: string | null }): VendorPromo => ({
  ...mapCoupon(row),
  shopId: row.shop_id ?? undefined,
  createdBy: row.created_by ?? undefined,
  createdAt: row.created_at ? Date.parse(row.created_at) : undefined,
});

/** This shop's codes, newest first. Empty on any read failure (never a crash). */
export async function listVendorPromos(
  db: SupabaseClient,
  shopId: string,
): Promise<VendorPromo[]> {
  const { data, error } = await db
    .from("coupons")
    .select("*")
    .eq("shop_id", shopId)
    .order("valid_until", { ascending: false })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as DbCoupon[]).map(mapPromo);
}

/**
 * The board the vendor page renders: codes + caps + what the codes have cost.
 * The cost comes from the ledger, which is written when an order is delivered —
 * so the number is money that actually moved, not money promised.
 */
export async function promoBoard(
  db: SupabaseClient,
  shopId: string,
): Promise<PromoBoard> {
  const [promos, limits, ledger] = await Promise.all([
    listVendorPromos(db, shopId),
    readPromoLimits(db),
    db
      .from("shop_ledger")
      .select("promo_discount")
      .eq("shop_id", shopId)
      .limit(1000),
  ]);
  const rows = (ledger.data ?? []) as { promo_discount?: number | null }[];
  return {
    promos,
    limits,
    usedTotal: promos.reduce((sum, p) => sum + p.used, 0),
    discountBornePaisa: ledger.error
      ? 0
      : rows.reduce((sum, r) => sum + (r.promo_discount ?? 0), 0),
  };
}

/**
 * Create a code for this shop. Validation first (the friendly refusal), then
 * the database's own guard (the real one) — its message is passed through
 * unchanged, because "percent must be between 1 and 25" is exactly what the
 * shop needs to see.
 */
export async function createVendorPromo(
  db: SupabaseClient,
  input: {
    shopId: string;
    raw: unknown;
    by?: string | null;
    limits: PromoLimits;
    now?: number;
  },
): Promise<VendorPromo> {
  const checked = validateVendorPromo(input.raw, input.limits);
  if (!checked.ok) {
    const first = Object.values(checked.errors)[0];
    throw new AdminInputError(first ?? "Please check the code details.", 422);
  }
  const v = checked.value;
  const now = input.now ?? Date.now();
  const validFrom = new Date(now).toISOString();
  const validUntil = new Date(now + v.days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("coupons")
    .insert({
      code: v.code,
      type: v.type,
      value: v.value,
      min_order: v.minOrder,
      max_discount: v.maxDiscount,
      description: v.description || null,
      valid_from: validFrom,
      valid_until: validUntil,
      usage_limit: v.usageLimit,
      used: 0,
      active: true,
      shop_id: input.shopId,
      created_by: (input.by ?? "").trim().slice(0, 160) || null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new AdminInputError("That code is already taken — try another spelling.", 409);
    }
    // The guard triggers answer in plain language; show it as it is.
    throw new AdminInputError(error.message || "Could not save the code.", 422);
  }
  if (!data) throw new AdminInputError("Could not save the code.", 503);
  return mapPromo(data as DbCoupon);
}

/** Pause or resume one of the shop's codes. */
export async function setVendorPromoActive(
  db: SupabaseClient,
  input: { shopId: string; id: string; active: boolean },
): Promise<VendorPromo> {
  const { data, error } = await db
    .from("coupons")
    .update({ active: input.active })
    .eq("id", input.id)
    .eq("shop_id", input.shopId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new AdminInputError(error?.message || "That code is not available to your shop.", 404);
  }
  return mapPromo(data as DbCoupon);
}
