/**
 * Server-side data for the P0 growth levers (price-drop watches + referral).
 *
 * Both are deliberately small: a watch is one row per (product, phone), and a
 * referral code is one row per customer account. There is no email or SMS
 * sender in this stack, so a "price dropped" alert used to be a NOTE FOR STAFF
 * with the phone numbers to call — the honest version of the feature in a town
 * where orders are confirmed on the phone.
 *
 * Since 2026-09-24 there is a second, better half: a watcher who turned phone
 * notifications on from `/track` gets the news pushed to that phone
 * immediately, and the staff note only names the numbers that could NOT be
 * reached (see `pushWatchPhones`). The call list literally shrinks as more
 * shoppers opt in — while a push failure or an unconfigured VAPID key never
 * loses a number from the list.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaff } from "./engagement";
import { pushProductEvent } from "../customer-push";
import type { ProductEventKind } from "../notify-messages";
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
 * Push a watch event to the watchers who turned phone notifications on, and
 * answer with the numbers that could NOT be reached.
 *
 * Never throws, never guesses: with no VAPID keys, no opt-in, or a push
 * service having a bad day, the returned set is empty and the staff note goes
 * out exactly as it did before this existed. A failure here must not cost the
 * shop its call list.
 */
const pushWatchPhones = async (
  db: SupabaseClient,
  input: {
    phones: string[];
    kind: ProductEventKind;
    productName: string;
    pricePaisa?: number | null;
    href?: string | null;
  },
): Promise<Set<string>> => {
  try {
    const { reached } = await pushProductEvent(db, input);
    return new Set(reached);
  } catch {
    return new Set();
  }
};

/**
 * The second line of the staff note: how many numbers are actually left to
 * call. Written as a sentence staff can act on, never as a silent difference.
 */
const callListLine = (
  total: number,
  reached: number,
  missed: { phone: string }[],
): string => {
  const numbers = missed
    .slice(0, 8)
    .map((r) => r.phone)
    .join(", ");
  if (missed.length === 0) {
    return `${total} জন অপেক্ষা করছিলেন — সবাইকে ফোনে খবর (push) পাঠানো হয়েছে, কাউকে ফোন করতে হবে না।`;
  }
  const sent = reached > 0 ? `${reached} জনকে ফোনে খবর পাঠানো হয়েছে · ` : "";
  return `${sent}বাকি ${missed.length} জনকে ফোন করুন: ${numbers}`;
};

/**
 * A price went down: push every watcher whose phone is subscribed, then hand
 * staff only the numbers still to call. Idempotent by `last_notified_paisa`,
 * so re-saving the same price does not spam anybody.
 */
export async function flagPriceDropForStaff(
  db: SupabaseClient,
  input: {
    productId: string;
    productName: string;
    fromPaisa: number;
    toPaisa: number;
    /** `/product/<slug>` for the push link (optional — falls back to /shop). */
    productSlug?: string | null;
  },
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
  const phones = [...new Set(rows.map((r) => r.phone))];
  const reached = await pushWatchPhones(db, {
    phones,
    kind: "price-drop",
    productName: input.productName,
    pricePaisa: input.toPaisa,
    href: input.productSlug ? `/product/${input.productSlug}` : null,
  });
  const missed = rows.filter((r) => !reached.has(r.phone));
  await notifyStaff(db, {
    kind: "system",
    title: `দাম কমেছে — ${input.productName}`,
    body: `${formatBdt(input.fromPaisa)} → ${formatBdt(input.toPaisa)} · ${callListLine(
      rows.length,
      reached.size,
      missed,
    )}`,
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
 * A product came back in stock: push every watcher whose phone is subscribed,
 * then hand staff only the numbers still to call. The caller only fires this
 * on a real out-of-stock → in-stock transition (admin.ts), so one restock =
 * one round of messages; a product that sells out again later earns a new
 * round — that is a real new event, not a nag. Never throws.
 */
export async function flagRestockForStaff(
  db: SupabaseClient,
  input: {
    productId: string;
    productName: string;
    /** `/product/<slug>` for the push link (optional — falls back to /shop). */
    productSlug?: string | null;
    /** The current price, shown in the push ("আবার পাওয়া যাচ্ছে ৳১,২৪০"). */
    pricePaisa?: number | null;
  },
): Promise<number> {
  const { data, error } = await db
    .from("stock_watches")
    .select("id,phone")
    .eq("product_id", input.productId);
  if (error) return 0;
  const rows = (data ?? []) as { id: string; phone: string }[];
  if (rows.length === 0) return 0;
  const phones = [...new Set(rows.map((r) => r.phone))];
  const reached = await pushWatchPhones(db, {
    phones,
    kind: "back-in-stock",
    productName: input.productName,
    pricePaisa: input.pricePaisa ?? null,
    href: input.productSlug ? `/product/${input.productSlug}` : null,
  });
  const missed = rows.filter((r) => !reached.has(r.phone));
  await notifyStaff(db, {
    kind: "system",
    title: `স্টক ফিরেছে — ${input.productName}`,
    body: callListLine(rows.length, reached.size, missed),
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
