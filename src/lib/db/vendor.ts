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
import {
  AdminInputError,
  isPreTwoTapRefusal,
  legacyTwoStepReady,
  orderFlowSchemaGap,
} from "./admin";
import type { Category, Product, Shop } from "../catalog";
import { validateVacation } from "../shop-vacation";
import type { Order, OrderStatus } from "../orders";
import { mapCategory, mapProduct, mapShop } from "./mappers";
import { parseShopFreeDeliveryMin } from "../free-delivery";
import { toDomain, toDomainMany } from "./orders";
import type {
  DbCategory,
  DbMedia,
  DbProduct,
  DbShopLedger,
  DbOrder,
  DbShopPayout,
  DbShop,
  DbVariant,
} from "./types";
import { shopPaymentVerifier } from "@/lib/db/payment-verifier";
import { isMissingDbObject } from "./riders";

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
  /** B6 — holiday dates, YYYY-MM-DD (both together, or null to clear). */
  vacation_start?: string | null;
  vacation_end?: string | null;
  vacation_note?: string | null;
  name?: string;
  tagline?: string;
  logo_url?: string;
  /** Cover photo URL (migration 202609270002). */
  cover_url?: string;
  phone?: string;
  address?: string;
  prep_minutes?: number;
  is_open?: boolean;
  /** Free delivery (2026-09-26): the shop's own minimum in paisa; null = off. */
  free_delivery_min?: number | null;
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
    // B6: booking a holiday is the OWNER's call — it stops the shop's own
    // sales for days, which is not a thing to leave to a staff login.
    const allowed = new Set(["is_open", "isOpen", "prep_minutes", "prepMinutes"]);
    const extra = Object.keys(body).filter((k) => !allowed.has(k));
    if (extra.length > 0) {
      throw new AdminInputError("Only the shop owner can edit that.", 403);
    }
  }
  take("name", body.name === undefined ? undefined : clean(body.name, 80));
  take("tagline", body.tagline === undefined ? undefined : clean(body.tagline, 200));
  take(
    "logo_url",
    body.logo_url === undefined && body.logoUrl === undefined
      ? undefined
      : clean((body.logo_url ?? body.logoUrl) as unknown, 500),
  );
  take(
    "cover_url",
    body.cover_url === undefined && body.coverUrl === undefined
      ? undefined
      : clean((body.cover_url ?? body.coverUrl) as unknown, 500),
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
  // Free delivery (2026-09-26): owner-only (staff can't spend the shop's
  // money); an explicit null / "" / 0 switches the shop's rule OFF. The key is
  // only written when sent, so a database without 202609260003 still saves
  // the rest of the profile.
  if (body.free_delivery_min !== undefined || body.freeDeliveryMinPaisa !== undefined) {
    const raw =
      body.free_delivery_min !== undefined ? body.free_delivery_min : body.freeDeliveryMinPaisa;
    if (raw !== null && raw !== "" && raw !== 0 && raw !== false) {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        throw new AdminInputError("ফ্রি ডেলিভারির ন্যূনতম অর্ডার টাকায় লিখুন (যেমন ৯৯৯)।");
      }
    }
    patch.free_delivery_min = parseShopFreeDeliveryMin(raw);
  }
  // B6 — the holiday. Validated HERE, not only in the form: a direct API call
  // could otherwise book a 400-day "holiday" (a permanent closure by another
  // name) or a window that ended last month.
  if (
    body.vacation_start !== undefined ||
    body.vacation_end !== undefined ||
    body.vacationStart !== undefined ||
    body.vacationEnd !== undefined ||
    body.vacationNote !== undefined
  ) {
    const checked = validateVacation({
      start: body.vacation_start ?? body.vacationStart,
      end: body.vacation_end ?? body.vacationEnd,
      note: body.vacationNote,
    });
    if (!checked.ok) {
      throw new AdminInputError(
        Object.values(checked.errors)[0] ?? "Check the holiday dates.",
        422,
      );
    }
    patch.vacation_start = checked.value.start;
    patch.vacation_end = checked.value.end;
    patch.vacation_note = checked.value.note || null;
  }

  if (patch.name !== undefined && patch.name.length < 2) {
    throw new AdminInputError("Shop name is too short.");
  }
  // The form marks phone/address required, but a direct API call could save
  // garbage — riders navigate by these, so validate them server-side too.
  if (
    patch.phone !== undefined &&
    !/^\+?\d{6,15}$/.test(patch.phone.replace(/[\s-]/g, ""))
  ) {
    throw new AdminInputError("দোকানের সঠিক ফোন নম্বর দিন।");
  }
  if (patch.address !== undefined && patch.address.length < 6) {
    throw new AdminInputError("পিকআপের পূর্ণ ঠিকানা দিন (কমপক্ষে ৬ অক্ষর)।");
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
  // P1.3: one batched mapping for the whole page instead of one per order.
  const mapped = await toDomainMany(db, (data ?? []) as DbOrder[]);
  return mapped.filter((order): order is Order => order !== null);
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
  if (order.payment !== "cod" && order.paymentStatus === "pending_verification") {
    order.paymentVerifier = await shopPaymentVerifier(db, shopId);
  }
  const rider = await readShopRider(db, (data as DbOrder).id);
  if (rider) order.shopRider = rider;
  return order;
}

/**
 * Audit H: who is coming for the parcel. A narrow definer RPC (shops cannot
 * read riders / assignments). Never fatal: before 202610010005, or on any
 * failure, the order page simply shows no rider card.
 */
export const parseShopRider = (raw: unknown): Order["shopRider"] | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.state === "picked_up" ? "picked_up" : r.state === "accepted" ? "accepted" : null;
  if (!state || typeof r.name !== "string" || typeof r.phone !== "string") return null;
  return {
    name: r.name,
    phone: r.phone,
    vehicle: typeof r.vehicle === "string" ? r.vehicle : "bike",
    state,
  };
};

export async function readShopRider(
  db: SupabaseClient,
  orderId: string,
): Promise<Order["shopRider"] | null> {
  const { data, error } = await db.rpc("ps_vendor_order_rider", { p_order_id: orderId });
  if (error) {
    if (!isMissingDbObject(error)) {
      console.error("[vendor] rider lookup failed:", error.message);
    }
    return null;
  }
  return parseShopRider(data);
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
  const orderId = (data as { id: string }).id;
  let { error: rpcError } = await db.rpc("ps_advance_order", {
    p_order_id: orderId,
    p_to: to,
    p_note: null,
  });
  if (rpcError && isPreTwoTapRefusal(rpcError, to)) {
    // Database predates 202609170001 — same two-step fallback as staff.
    rpcError = await legacyTwoStepReady(db, orderId, null);
  }
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
    // Same honesty as the staff path: a schema-level refusal is logged with
    // its SQLSTATE and named to the vendor as a repair, not a bare generic.
    const gap = orderFlowSchemaGap(rpcError);
    console.error(
      "[vendor] ps_advance_order failed",
      JSON.stringify({
        orderNo,
        to,
        code: rpcError.code ?? null,
        message: rpcError.message ?? null,
        ...(gap ? { schemaGap: gap } : {}),
      }),
    );
    if (gap) {
      throw new AdminInputError(
        "The database refused this change — the order was NOT updated. Ask PROSANTI staff to apply the pending order repair.",
        503,
      );
    }
    throw new AdminInputError("Could not update the order.", 422);
  }
  return getVendorOrderDetail(db, shopId, orderNo);
}

/**
 * The shop's decision on a bKash/Nagad payment (2026-09-18). ps_verify_payment
 * already authorises the OWNING shop (`orders.shop_id = ps_vendor_shop()`),
 * so the vendor may settle its own wallet money without waiting for PROSANTI
 * staff; the shop scope here is belt-and-braces (a foreign order number
 * answers 404, never a leak). Same rules and messages as the staff path.
 */
export async function verifyPaymentAsVendor(
  db: SupabaseClient,
  shopId: string,
  orderNo: string,
  action: "verified" | "rejected",
  note?: string,
): Promise<Order> {
  const { data, error } = await db
    .from("orders")
    .select("id")
    .eq("shop_id", shopId)
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) throw new AdminInputError("Order not found.", 404);
  const { error: rpcError } = await db.rpc("ps_verify_payment", {
    p_order_id: (data as { id: string }).id,
    p_action: action,
    p_note: note?.trim().slice(0, 300) ?? null,
  });
  if (rpcError) {
    const msg = rpcError.message.toLowerCase();
    if (msg.includes("forbidden")) {
      throw new AdminInputError("Only the shop that owns this order can decide its payment.", 403);
    }
    if (msg.includes("reserved for the platform")) {
      throw new AdminInputError(
        "PROSANTI staff verify the wallet payments for your shop — you will see the result here.",
        403,
      );
    }
    if (msg.includes("not a wallet payment")) {
      throw new AdminInputError(
        "This order is cash on delivery — nothing to verify.",
        422,
      );
    }
    if (msg.includes("already decided")) {
      throw new AdminInputError("This payment was already decided.", 409);
    }
    if (msg.includes("order already cancelled")) {
      throw new AdminInputError(
        "This order was cancelled — its wallet payment is settled as rejected; nothing to decide.",
        422,
      );
    }
    const gap = orderFlowSchemaGap(rpcError);
    console.error(
      "[vendor] ps_verify_payment failed",
      JSON.stringify({
        orderNo,
        action,
        code: rpcError.code ?? null,
        message: rpcError.message ?? null,
        ...(gap ? { schemaGap: gap } : {}),
      }),
    );
    if (gap) {
      throw new AdminInputError(
        "The database refused this decision — the payment was NOT updated. Ask PROSANTI staff to apply the pending order repair.",
        503,
      );
    }
    throw new AdminInputError("Could not record the payment decision.", 422);
  }
  return getVendorOrderDetail(db, shopId, orderNo);
}

/* ------------------------------------------------------------------ */
/* Products (own shop — drafts included)                               */
/* ------------------------------------------------------------------ */

/**
 * The shop's own catalog, drafts and archived rows included. Three batched
 * reads whatever the size — until 2026-09-18 this ran three queries PER
 * product (a 200-piece shop = 600 round trips on every visit and after
 * every save).
 */
export async function listVendorProducts(
  db: SupabaseClient,
  shopId: string,
): Promise<Product[]> {
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("vendor product list failed");
  const products = (data ?? []) as DbProduct[];
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [vRes, mRes] = await Promise.all([
    db.from("product_variants").select("*").in("product_id", ids),
    db.from("product_media").select("*").in("product_id", ids).order("sort_order"),
  ]);
  if (vRes.error || mRes.error) throw new Error("vendor product list failed");
  const variants = (vRes.data ?? []) as DbVariant[];
  const media = (mRes.data ?? []) as DbMedia[];
  return products.map((p) =>
    mapProduct({
      product: p,
      variants: variants.filter((v) => v.product_id === p.id),
      media: media.filter((m) => m.product_id === p.id),
    }),
  );
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
    if (
      patch.free_delivery_min !== undefined &&
      ((error as { code?: string } | null)?.code === "PGRST204" ||
        /free_delivery_min/.test((error as { message?: string } | null)?.message ?? ""))
    ) {
      throw new AdminInputError(
        "ফ্রি ডেলিভারি এখনো এই ডেটাবেসে চালু হয়নি — অ্যাডমিনকে supabase/migrations/202609260003_free_delivery.sql চালাতে বলুন।",
        503,
      );
    }
    if (
      patch.cover_url !== undefined &&
      ((error as { code?: string } | null)?.code === "PGRST204" ||
        /cover_url/.test((error as { message?: string } | null)?.message ?? ""))
    ) {
      throw new AdminInputError(
        "কভার ছবি এখনো এই ডেটাবেসে চালু হয়নি — অ্যাডমিনকে supabase/migrations/202609270002_shop_cover.sql চালাতে বলুন।",
        503,
      );
    }
    throw new Error("vendor shop update failed");
  }
  return mapShop(data as DbShop);
}

export interface VendorProductCategory {
  id: string;
  categoryId: string;
  name: string;
}

export async function listShopProductCategories(
  db: SupabaseClient,
  shopId: string,
): Promise<VendorProductCategory[]> {
  const { data, error } = await db
    .from("shop_product_categories")
    .select("id, category_id, name")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("vendor category list failed");
  return ((data ?? []) as { id: string; category_id: string; name: string }[]).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
  }));
}

export async function listVendorCategoryData(
  db: SupabaseClient,
  shopId: string,
): Promise<{ categories: Category[]; vendorCategories: VendorProductCategory[] }> {
  const [{ data, error }, vendorCategories] = await Promise.all([
    db
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order"),
    listShopProductCategories(db, shopId),
  ]);
  if (error) throw new Error("vendor category list failed");
  const categories = ((data ?? []) as DbCategory[]).map(mapCategory);
  const names = new Map<string, string[]>();
  for (const row of vendorCategories) {
    const list = names.get(row.categoryId) ?? [];
    if (!list.some((name) => name.toLocaleLowerCase() === row.name.toLocaleLowerCase())) {
      list.push(row.name);
      names.set(row.categoryId, list);
    }
  }
  return {
    vendorCategories,
    categories: categories.map((category) => ({
      ...category,
      // The form keeps free text; this list only makes a vendor's own names
      // available as one-tap suggestions under platform-owned top-levels.
      subCategories: [
        ...category.subCategories,
        ...(names.get(category.id) ?? []).filter((name) =>
          !category.subCategories.some(
            (existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ),
        ),
      ],
    })),
  };
}

export async function listVendorCategories(
  db: SupabaseClient,
  shopId?: string,
): Promise<Category[]> {
  if (!shopId) {
    const { data, error } = await db
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error("vendor category list failed");
    return ((data ?? []) as DbCategory[]).map(mapCategory);
  }
  return (await listVendorCategoryData(db, shopId)).categories;
}

export async function createVendorProductCategory(
  db: SupabaseClient,
  shopId: string,
  raw: unknown,
): Promise<{ id: string; categoryId: string; name: string }> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!categoryId) throw new AdminInputError("Choose a platform category.", 422);
  if (name.length < 2 || name.length > 60) {
    throw new AdminInputError("Subcategory must be 2–60 characters.", 422);
  }
  const { data: parent, error: parentError } = await db
    .from("categories")
    .select("id, active")
    .eq("id", categoryId)
    .single();
  if (parentError || !parent || (parent as { active?: boolean }).active !== true) {
    throw new AdminInputError("That platform category is not available.", 422);
  }
  const { data, error } = await db
    .from("shop_product_categories")
    .insert({ shop_id: shopId, category_id: categoryId, name })
    .select("id, category_id, name")
    .single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      throw new AdminInputError("That subcategory already exists in this category.", 409);
    }
    throw new Error("vendor category create failed");
  }
  const row = data as { id: string; category_id: string; name: string };
  return { id: row.id, categoryId: row.category_id, name: row.name };
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
    /** Row uuid (kept for keys); shops recognise `orderNo`. */
    orderId: string;
    /** PUBLIC order number (PS-…); empty when the order row is unreadable. */
    orderNo: string;
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
      // Left-join the order number: a uuid prefix meant nothing to the shop
      // (2026-09-18). Left, not inner — a ledger row must never vanish
      // because its order row happened to be unreadable.
      .select("*, orders(order_no)")
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
  const ledger = (
    (ledgerRes.data ?? []) as (DbShopLedger & {
      orders?: { order_no: string } | { order_no: string }[] | null;
    })[]
  ).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    orderNo: Array.isArray(r.orders)
      ? (r.orders[0]?.order_no ?? "")
      : (r.orders?.order_no ?? ""),
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
