/**
 * Vendor data-access layer (marketplace phase 2, slice 3).
 *
 * Every helper takes the RLS-bound vendor client from requireVendor() plus
 * the verified shopId — database policies scope the rows, and these helpers
 * scope the operations (early order states, whitelisted shop fields).
 * Validation errors throw AdminInputError (shared envelope with staff).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInputError, readProductBundle } from "./admin";
import type { Category, Product, Shop } from "../catalog";
import type { Order, OrderStatus } from "../orders";
import { mapCategory, mapShop } from "./mappers";
import { toDomain } from "./orders";
import type {
  DbCategory,
  DbShopLedger,
  DbOrder,
  DbShopPayout,
  DbShop,
} from "./types";

/* ------------------------------------------------------------------ */
/* Pure guards (unit-tested)                                           */
/* ------------------------------------------------------------------ */

/** Vendor-reachable targets — dispatch states stay staff/dispatch-owned. */
const VENDOR_TARGETS: readonly string[] = [
  "confirmed",
  "preparing",
  "ready-for-pickup",
  "cancelled",
];

export const assertVendorTarget = (to: string): void => {
  if (!VENDOR_TARGETS.includes(to)) {
    throw new AdminInputError(
      "That status change is handled by PROSANTI dispatch.",
      403,
    );
  }
};

export interface VendorShopPatch {
  name?: string;
  tagline?: string;
  logo_url?: string;
  phone?: string;
  address?: string;
  prep_minutes?: number;
  is_open?: boolean;
}

/**
 * Whitelist a vendor shop PATCH. Owners may edit profile-ish fields;
 * staff may only flip the open sign + prep time. Platform-owned fields
 * (status/commission/zones/slug) never pass — the DB trigger guards them
 * too, but the API shouldn't even try.
 */
export const vendorShopPatch = (
  raw: unknown,
  role: "owner" | "staff",
): VendorShopPatch => {
  const body = (raw ?? {}) as Record<string, unknown>;
  const clean = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const patch: VendorShopPatch = {};
  const take = (key: keyof VendorShopPatch, v: unknown): void => {
    if (v !== undefined) {
      (patch as Record<string, unknown>)[key] = v;
    }
  };
  if (role === "staff") {
    const allowed = new Set(["is_open", "isOpen", "prep_minutes", "prepMinutes"]);
    const extra = Object.keys(body).filter((k) => !allowed.has(k));
    if (extra.length > 0) {
      throw new AdminInputError("Only the shop owner can edit that.", 403);
    }
  }
  take("name", body.name === undefined ? undefined : clean(body.name, 80) || undefined);
  take("tagline", body.tagline === undefined ? undefined : clean(body.tagline, 200));
  take(
    "logo_url",
    body.logo_url === undefined && body.logoUrl === undefined
      ? undefined
      : clean((body.logo_url ?? body.logoUrl) as unknown, 500),
  );
  take("phone", body.phone === undefined ? undefined : clean(body.phone, 20));
  take("address", body.address === undefined ? undefined : clean(body.address, 300));
  if (body.prep_minutes !== undefined || body.prepMinutes !== undefined) {
    const n = Math.floor(
      Number(body.prep_minutes ?? body.prepMinutes ?? Number.NaN),
    );
    if (!Number.isFinite(n) || n < 0 || n > 240) {
      throw new AdminInputError("Prep time must be between 0 and 240 minutes.");
    }
    patch.prep_minutes = n;
  }
  if (body.is_open !== undefined || body.isOpen !== undefined) {
    patch.is_open = (body.is_open ?? body.isOpen) === true;
  }
  if (patch.name !== undefined && patch.name.length < 2) {
    throw new AdminInputError("Shop name is too short.");
  }
  return patch;
};

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export async function listVendorOrders(
  db: SupabaseClient,
  shopId: string,
  status?: string,
): Promise<Order[]> {
  let query = db
    .from("orders")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error("vendor order list failed");
  const out: Order[] = [];
  for (const row of ((data ?? []) as DbOrder[])) {
    const order = await toDomain(db, row);
    if (order) out.push(order);
  }
  return out;
}

export async function getVendorOrderDetail(
  db: SupabaseClient,
  shopId: string,
  orderNo: string,
): Promise<Order> {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("shop_id", shopId)
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) throw new AdminInputError("Order not found.", 404);
  const order = await toDomain(db, data as DbOrder);
  if (!order) throw new Error("vendor order detail failed");
  return order;
}

export async function advanceVendorOrder(
  db: SupabaseClient,
  shopId: string,
  orderNo: string,
  to: string,
): Promise<Order> {
  assertVendorTarget(to);
  const { data, error } = await db
    .from("orders")
    .select("id")
    .eq("shop_id", shopId)
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) throw new AdminInputError("Order not found.", 404);
  const { error: rpcError } = await db.rpc("ps_advance_order", {
    p_order_id: (data as { id: string }).id,
    p_to: to,
    p_note: null,
  });
  if (rpcError) {
    const msg = rpcError.message.toLowerCase();
    if (msg.includes("forbidden")) {
      throw new AdminInputError("That status change is not allowed.", 403);
    }
    if (msg.includes("illegal transition") || msg.includes("cannot cancel")) {
      throw new AdminInputError(
        "That status change is not allowed from here.",
        422,
      );
    }
    throw new AdminInputError("Could not update the order.", 422);
  }
  return getVendorOrderDetail(db, shopId, orderNo);
}

/* ------------------------------------------------------------------ */
/* Products (own shop — drafts included)                               */
/* ------------------------------------------------------------------ */

export async function listVendorProducts(
  db: SupabaseClient,
  shopId: string,
): Promise<Product[]> {
  const { data, error } = await db
    .from("products")
    .select("id")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("vendor product list failed");
  const out: Product[] = [];
  for (const row of ((data ?? []) as { id: string }[])) {
    out.push(await readProductBundle(db, row.id));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Shop profile + hours                                                */
/* ------------------------------------------------------------------ */

export async function getVendorShop(
  db: SupabaseClient,
  shopId: string,
): Promise<Shop> {
  const { data, error } = await db
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .single();
  if (error || !data) throw new AdminInputError("Shop not found.", 404);
  return mapShop(data as DbShop);
}

export async function patchVendorShop(
  db: SupabaseClient,
  shopId: string,
  role: "owner" | "staff",
  raw: unknown,
): Promise<Shop> {
  const patch = vendorShopPatch(raw, role);
  if (Object.keys(patch).length === 0) {
    throw new AdminInputError("Nothing to update.");
  }
  const { data, error } = await db
    .from("shops")
    .update(patch)
    .eq("id", shopId)
    .select("*")
    .single();
  if (error || !data) {
    if ((error as { message?: string } | null)?.message?.includes("forbidden")) {
      throw new AdminInputError("That change is not allowed.", 403);
    }
    throw new Error("vendor shop update failed");
  }
  return mapShop(data as DbShop);
}

export async function listVendorCategories(
  db: SupabaseClient,
): Promise<Category[]> {
  const { data, error } = await db
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error("vendor category list failed");
  return ((data ?? []) as DbCategory[]).map(mapCategory);
}

/* ------------------------------------------------------------------ */
/* Earnings (ledger writer lands in slice 5 — honest empty until then) */
/* ------------------------------------------------------------------ */

export interface VendorEarnings {
  lifetimePayable: number;
  lifetimePaid: number;
  balance: number;
  ledger: {
    id: string;
    orderId: string;
    subtotal: number;
    commission: number;
    payable: number;
    deliveryCharge?: number;
    tipAmount?: number;
    surchargeTotal?: number;
    at: number;
  }[];
  payouts: {
    id: string;
    amount: number;
    method: string;
    reference: string;
    at: number;
  }[];
}

export async function listVendorEarnings(
  db: SupabaseClient,
  shopId: string,
): Promise<VendorEarnings> {
  const [ledgerRes, payoutRes] = await Promise.all([
    db
      .from("shop_ledger")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("shop_payouts")
      .select("*")
      .eq("shop_id", shopId)
      .order("paid_at", { ascending: false })
      .limit(20),
  ]);
  if (ledgerRes.error || payoutRes.error) {
    throw new Error("vendor earnings failed");
  }
  const ledger = ((ledgerRes.data ?? []) as DbShopLedger[]).map((r: any) => ({
    id: r.id,
    orderId: r.order_id,
    subtotal: r.subtotal,
    commission: r.commission,
    payable: r.payable,
    deliveryCharge: r.delivery_charge ?? 0,
    tipAmount: r.tip_amount ?? 0,
    surchargeTotal: r.surcharge_total ?? 0,
    at: Date.parse(r.created_at),
  }));
  const payouts = ((payoutRes.data ?? []) as DbShopPayout[]).map((r) => ({
    id: r.id,
    amount: r.amount,
    method: r.method,
    reference: r.reference,
    at: Date.parse(r.paid_at),
  }));
  const lifetimePayable = ledger.reduce((s, r) => s + r.payable, 0);
  const lifetimePaid = payouts.reduce((s, r) => s + r.amount, 0);
  return {
    lifetimePayable,
    lifetimePaid,
    balance: lifetimePayable - lifetimePaid,
    ledger,
    payouts,
  };
}

export type { OrderStatus };
