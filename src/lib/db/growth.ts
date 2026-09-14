/**
 * Server-side data for the P0 growth levers (price-drop watches + referral).
 *
 * Both are deliberately small: a watch is one row per (product, phone), and a
 * referral code is one row per customer account. There is no email or SMS
 * sender in this stack, so a "price dropped" alert is a NOTE FOR STAFF with the
 * phone numbers to call — the honest version of the feature in a town where
 * orders are confirmed on the phone. Fabricating an "email sent" status would
 * be worse than not offering it.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaff } from "./engagement";
import { normalizePhone } from "../orders";
import { referralCodeFor } from "../referral";
import { formatBdt } from "../format";

export interface PriceWatchRow {
  id: string;
  productId: string;
  productName: string;
  phone: string;
  targetPaisa: number | null;
  createdAt: string;
}

type DbWatch = {
  id: string;
  product_id: string;
  phone: string;
  target_paisa: number | null;
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
};

const productNameOf = (row: {
  products?: { name: string } | { name: string }[] | null;
}): string => {
  const joined = row.products;
  if (!joined) return "";
  const first = Array.isArray(joined) ? joined[0] : joined;
  return first?.name ?? "";
};

/** One row per (product, phone) — re-subscribing refreshes the target, not a
 *  second copy of the same person. */
export async function createPriceWatch(
  db: SupabaseClient,
  input: { productId: string; phone: string; targetPaisa?: number | null },
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const { error } = await db.from("price_watches").upsert(
    {
      product_id: input.productId,
      phone,
      target_paisa:
        typeof input.targetPaisa === "number" && input.targetPaisa > 0
          ? Math.floor(input.targetPaisa)
          : null,
    },
    { onConflict: "product_id,phone" },
  );
  if (error) throw new Error("price watch write failed");
}

export async function deletePriceWatch(
  db: SupabaseClient,
  input: { productId: string; phone: string },
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const { error } = await db
    .from("price_watches")
    .delete()
    .eq("product_id", input.productId)
    .eq("phone", phone);
  if (error) throw new Error("price watch delete failed");
}

export async function listPriceWatches(
  db: SupabaseClient,
  productId?: string,
): Promise<PriceWatchRow[]> {
  let query = db
    .from("price_watches")
    .select("id,product_id,phone,target_paisa,created_at,products(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as DbWatch[]).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: productNameOf(row),
    phone: row.phone,
    targetPaisa: row.target_paisa,
    createdAt: row.created_at,
  }));
}

/**
 * A price went down: hand staff the list to call, once per price. Idempotent by
 * `last_notified_paisa`, so re-saving the same price does not spam the inbox.
 */
export async function flagPriceDropForStaff(
  db: SupabaseClient,
  input: { productId: string; productName: string; fromPaisa: number; toPaisa: number },
): Promise<number> {
  if (input.toPaisa >= input.fromPaisa) return 0;
  const { data, error } = await db
    .from("price_watches")
    .select("id,phone,last_notified_paisa")
    .eq("product_id", input.productId);
  if (error) return 0;
  const rows = ((data ?? []) as {
    id: string;
    phone: string;
    last_notified_paisa: number | null;
  }[]).filter((r) => r.last_notified_paisa !== input.toPaisa);
  if (rows.length === 0) return 0;
  await notifyStaff(db, {
    kind: "system",
    title: `দাম কমেছে — ${input.productName}`,
    body: `${formatBdt(input.fromPaisa)} → ${formatBdt(input.toPaisa)} · ${rows.length} জন কাস্টমার অপেক্ষা করছেন — ফোন করুন: ${rows
      .slice(0, 8)
      .map((r) => r.phone)
      .join(", ")}`,
    href: "/admin/growth",
  });
  await db
    .from("price_watches")
    .update({ last_notified_paisa: input.toPaisa })
    .in("id", rows.map((r) => r.id));
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Back-in-stock watches (P2 #2)                                       */
/* ------------------------------------------------------------------ */

export interface StockWatchRow {
  id: string;
  productId: string;
  productName: string;
  phone: string;
  lastNotifiedAt: string | null;
  createdAt: string;
}

type DbStockWatch = {
  id: string;
  product_id: string;
  phone: string;
  last_notified_at: string | null;
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
};

/** One row per (product, phone) — asking twice refreshes, never duplicates. */
export async function createStockWatch(
  db: SupabaseClient,
  input: { productId: string; phone: string },
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const { error } = await db
    .from("stock_watches")
    .upsert(
      { product_id: input.productId, phone },
      { onConflict: "product_id,phone" },
    );
  if (error) throw new Error("stock watch write failed");
}

export async function deleteStockWatch(
  db: SupabaseClient,
  input: { productId: string; phone: string },
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const { error } = await db
    .from("stock_watches")
    .delete()
    .eq("product_id", input.productId)
    .eq("phone", phone);
  if (error) throw new Error("stock watch delete failed");
}

export async function listStockWatches(
  db: SupabaseClient,
  productId?: string,
): Promise<StockWatchRow[]> {
  let query = db
    .from("stock_watches")
    .select("id,product_id,phone,last_notified_at,created_at,products(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as DbStockWatch[]).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: productNameOf(row),
    phone: row.phone,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
  }));
}

/**
 * A product came back in stock: hand staff the list to call. The caller only
 * fires this on a real out-of-stock → in-stock transition (admin.ts), so one
 * restock = one inbox note; a product that sells out again later earns a new
 * note — that is a real new event, not a nag. Never throws.
 */
export async function flagRestockForStaff(
  db: SupabaseClient,
  input: { productId: string; productName: string },
): Promise<number> {
  const { data, error } = await db
    .from("stock_watches")
    .select("id,phone")
    .eq("product_id", input.productId);
  if (error) return 0;
  const rows = (data ?? []) as { id: string; phone: string }[];
  if (rows.length === 0) return 0;
  await notifyStaff(db, {
    kind: "system",
    title: `স্টক ফিরেছে — ${input.productName}`,
    body: `${rows.length} জন কাস্টমার অপেক্ষা করছেন — ফোন করুন: ${rows
      .slice(0, 8)
      .map((r) => r.phone)
      .join(", ")}`,
    href: "/admin/growth",
  });
  await db
    .from("stock_watches")
    .update({ last_notified_at: new Date().toISOString() })
    .in("id", rows.map((r) => r.id));
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Referral                                                            */
/* ------------------------------------------------------------------ */

export interface ReferralSummary {
  code: string;
  invited: number;
  rewarded: number;
  creditedPaisa: number;
  /** Friend orders that are placed but not yet delivered (reward pending). */
  pending: number;
  /** Coupon codes banked for this referrer, newest first. */
  coupons: { code: string; value: number; used: boolean; expiresAt: string | null }[];
}

/**
 * The code is deterministic per account (see `referralCodeFor`), so an account
 * always sees the same one. Recording it is what makes it *spendable*:
 * ps_place_order only credits a code that exists in `referral_codes`, and the
 * row is written the first time the account opens its share card.
 */
export async function ensureReferralCode(
  db: SupabaseClient,
  customer: { id: string; name: string; phone: string },
): Promise<string> {
  const code = referralCodeFor(customer.id);
  const { data: found } = await db
    .from("referral_codes")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  if (!found) {
    const { error } = await db.from("referral_codes").insert({
      code,
      customer_id: customer.id,
      customer_phone: normalizePhone(customer.phone),
      customer_name: customer.name.slice(0, 80),
    });
    // A second tab can race us; the unique key does the dedupe.
    if (error && error.code !== "23505") throw new Error("referral code write failed");
  }
  return code;
}

export async function referralSummary(
  db: SupabaseClient,
  code: string,
): Promise<ReferralSummary> {
  const empty: ReferralSummary = {
    code,
    invited: 0,
    rewarded: 0,
    creditedPaisa: 0,
    pending: 0,
    coupons: [],
  };
  const [rewardsRes, couponsRes] = await Promise.all([
    db
      .from("referral_rewards")
      .select(
        "friend_credit,referrer_reward,referrer_coupon_id,created_at,orders(status)",
      )
      .eq("code", code)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("coupons")
      .select("code,value,used,valid_until")
      .like("code", `PSREF${code}%`)
      .order("code", { ascending: false })
      .limit(20),
  ]);
  if (rewardsRes.error) return empty;
  type Row = {
    friend_credit: number;
    referrer_reward: number;
    referrer_coupon_id: string | null;
    orders: { status: string } | { status: string }[] | null;
  };
  const rows = (rewardsRes.data ?? []) as Row[];
  const statusOf = (row: Row): string => {
    const o = row.orders;
    if (!o) return "";
    const first = Array.isArray(o) ? o[0] : o;
    return first?.status ?? "";
  };
  return {
    code,
    invited: rows.length,
    rewarded: rows.filter((r) => r.referrer_coupon_id !== null).length,
    creditedPaisa: rows.reduce((s, r) => s + (r.referrer_reward ?? 0), 0),
    pending: rows.filter((r) => r.referrer_coupon_id === null && statusOf(r) !== "cancelled")
      .length,
    coupons: ((couponsRes.data ?? []) as {
      code: string;
      value: number;
      used: number;
      valid_until: string | null;
    }[]).map((c) => ({
      code: c.code,
      value: c.value,
      used: c.used > 0,
      expiresAt: c.valid_until,
    })),
  };
}
