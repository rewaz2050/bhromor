/**
 * Server-side order pipeline (blueprint §33–34, §75).
 *
 * - `loadOrderSnapshot()` — one batched read of everything checkout needs
 *   to price an order (products + variants + media + zones + coupons).
 * - `placeLiveOrder()` — persists a validated draft through the atomic
 *   `ps_place_order` RPC: row-locked stock reservation, coupon increment,
 *   order + snapshots + history in ONE transaction. Money comes from the
 *   draft, which the validator priced from this same snapshot — the client
 *   never sets a total — and the RPC re-validates authoritatively.
 * - `findLiveOrder()` — phone-gated tracking lookup. Returns null on any
 *   mismatch so callers cannot probe which half of (id, phone) was wrong.
 *
 * All functions return null when the service role is unconfigured; routes
 * answer with an honest 503 in that case.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "../supabase-server";
import type { Coupon } from "../coupons";
import type { DeliveryZone, Product, Shop } from "../catalog";
import { mapCoupon, mapOrder, mapProduct, mapShop, mapZone } from "./mappers";
import type {
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbProduct,
  DbShop,
  DbVariant,
  DbZone,
} from "./types";
import { normalizePhone, type Order } from "../orders";
import { sanitizeBundle, sanitizeFlash } from "../promos";
import { sanitizeGift } from "../gift";
import { sanitizeReferral, type ReferralRecord } from "../referral";
import { sanitizeSettings } from "../settings-store";
import type { ValidOrderDraft } from "../order-validation";

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: Coupon[];
  variants: DbVariant[];
  mediaByProduct: Map<string, string>;
  /** All shops (validator checks active/open/zone itself). */
  shops: Shop[];
  /** Total orders ever placed (global stat). */
  totalOrders: number;
  /** THIS customer's earlier order count — retained for future promos. */
  customerOrderCount?: number;
  /** ৳1000+-always-free toggle (ops) — retained for future promos. */
  freeThresholdEnabled?: boolean;
  /**
   * The P0 growth levers, sanitized from site_settings['ops'] — the SAME
   * document the storefront badges read. A client cannot invent a discount:
   * only what the shop armed here (and ps_place_order re-derives) is priced.
   */
  promos?: {
    flash: ReturnType<typeof sanitizeFlash>;
    bundle: ReturnType<typeof sanitizeBundle>;
    gift: ReturnType<typeof sanitizeGift>;
    referral: ReturnType<typeof sanitizeReferral>;
  };
  /** Issued referral codes with their reward counts (ledger). */
  referralRecords?: ReferralRecord[];
  /** Referee phones that already took a credit, per code. */
  referralRewards?: { code: string; refereePhone: string }[];
  /** Phones with an earlier non-cancelled order — first-order proof. */
  priorOrderPhones?: string[];
  /** P1 #8 — configured wallet numbers (empty/absent = not offered). */
  payments?: { bkash?: string; nagad?: string };
}

/**
 * How many orders has THIS customer (by normalized phone) already placed?
 * Drives the Smart Card stamp count (loyalty). Cancelled orders do not count.
 * Counts in JS so the phone normalization matches normalizePhone exactly.
 */
export async function countOrdersForPhone(
  db: SupabaseClient,
  phone: string,
): Promise<number> {
  const digits = normalizePhone(phone);
  if (digits === "") return 0;
  const { data, error } = await db
    .from("orders")
    .select("customer_phone")
    .neq("status", "cancelled");
  if (error) return 0; // fail closed → no free-delivery grant on DB errors
  return ((data ?? []) as { customer_phone: string }[]).filter(
    (row) => normalizePhone(row.customer_phone) === digits,
  ).length;
}

export async function loadOrderSnapshot(): Promise<OrderSnapshot | null> {
  const db = getSupabaseService();
  if (!db) return null;

  const [
    productsRes,
    variantsRes,
    mediaRes,
    zonesRes,
    couponsRes,
    shopsRes,
    ordersCountRes,
    opsRes,
    codesRes,
    rewardsRes,
    phonesRes,
  ] =
    await Promise.all([
      db
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("active", true),
      db.from("product_variants").select("*").eq("active", true),
      db.from("product_media").select("*").order("sort_order"),
      db.from("delivery_zones").select("*").eq("active", true),
      db.from("coupons").select("*").eq("active", true),
      db.from("shops").select("*"),
      db.from("orders").select("id", { count: "exact", head: true }),
      // ৳1000+-always-free toggle; read failure keeps the default (on).
      db.from("site_settings").select("value").eq("key", "ops").maybeSingle(),
      // P0 growth reads. Missing tables (pre-migration) answer an error object,
      // never a throw — every lever simply prices at zero until they exist.
      db.from("referral_codes").select("code,customer_id,customer_phone,customer_name"),
      db.from("referral_rewards").select("code,referee_phone,referrer_coupon_id"),
      db.from("orders").select("customer_phone").neq("status", "cancelled").limit(5000),
    ]);
  if (
    productsRes.error ||
    variantsRes.error ||
    mediaRes.error ||
    zonesRes.error ||
    couponsRes.error ||
    shopsRes.error
  ) {
    throw new Error("order snapshot read failed");
  }

  const variants = (variantsRes.data ?? []) as DbVariant[];
  const media = (mediaRes.data ?? []) as DbMedia[];
  const products = ((productsRes.data ?? []) as DbProduct[]).map((p) =>
    mapProduct({
      product: p,
      variants: variants.filter((v) => v.product_id === p.id),
      media: media.filter((m) => m.product_id === p.id),
    }),
  );
  const mediaByProduct = new Map<string, string>();
  for (const m of media) {
    if (m.type === "image" && !mediaByProduct.has(m.product_id)) {
      mediaByProduct.set(m.product_id, m.url);
    }
  }
  const ops = (opsRes.data?.value ?? {}) as Record<string, unknown>;
  const settings = sanitizeSettings(ops);
  // P1 #8 — wallet numbers the storefront may offer (sanitized to BD mobile;
  // ps_place_order re-checks against the same ops document at placement).
  const walletNum = (v: unknown): string | undefined => {
    let digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
    if (digits.length > 11 && digits.startsWith("88")) digits = digits.slice(2);
    return /^01\d{9}$/.test(digits) ? digits : undefined;
  };
  const opsWallets = (ops.wallets ?? {}) as Record<string, unknown>;
  const codeRows = (codesRes.data ?? []) as {
    code: string;
    customer_id: string | null;
    customer_phone: string | null;
    customer_name: string | null;
  }[];
  const rewardRows = (rewardsRes.data ?? []) as {
    code: string;
    referee_phone: string;
    referrer_coupon_id: string | null;
  }[];
  return {
    promos: {
      flash: settings.flash,
      bundle: settings.bundle,
      gift: settings.gift,
      referral: settings.referral,
    },
    referralRecords: codeRows.map((row) => ({
      code: row.code,
      customerId: row.customer_id,
      referrerName: row.customer_name ?? "",
      referrerPhone: normalizePhone(row.customer_phone ?? ""),
      rewardsGranted: rewardRows.filter((r) => r.code === row.code).length,
      createdAt: 0,
    })),
    referralRewards: rewardRows.map((r) => ({
      code: r.code,
      refereePhone: r.referee_phone,
    })),
    priorOrderPhones: ((phonesRes.data ?? []) as { customer_phone: string }[]).map(
      (r) => r.customer_phone,
    ),
    products,
    payments: {
      bkash: walletNum(opsWallets.bkash),
      nagad: walletNum(opsWallets.nagad),
    },
    zones: ((zonesRes.data ?? []) as DbZone[]).map(mapZone),
    coupons: ((couponsRes.data ?? []) as DbCoupon[]).map(mapCoupon),
    variants,
    mediaByProduct,
    shops: ((shopsRes.data ?? []) as DbShop[]).map(mapShop),
    totalOrders: ordersCountRes.count ?? 0,
    freeThresholdEnabled: ops.perZoneFreeThresholdEnabled !== false,
  };
}

const parseVariant = (label: string): { color: string; size: string } => {
  const [color = "", size = ""] = label.split("·").map((s) => s.trim());
  return { color, size };
};

/** Match a checkout variant label to its row for stock reservation. */
const resolveVariant = (
  variants: DbVariant[],
  productId: string,
  label: string,
): DbVariant | undefined => {
  const { color, size } = parseVariant(label);
  const pool = variants.filter((v) => v.product_id === productId);
  return (
    pool.find((v) => v.color === color && v.size === size) ??
    (color === "" && size === "" ? pool[0] : undefined) ??
    (pool.length === 1 ? pool[0] : undefined)
  );
};

export class OrderPlacementError extends Error {
  status: number;
  field: string;
  constructor(field: string, message: string, status = 422) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

/**
 * Failures that are NOT the customer's doing — the database schema and the
 * installed `ps_place_order` disagree, so every order dies in the same way
 * regardless of what was typed. Each one names the file the owner has to run.
 *
 * Reproduced 2026-09-16 (see supabase/migrations/202609160002_order_insert_repair.sql):
 *  - 23502 on orders.gift_wrap — the column was NOT NULL while the RPC writes
 *    NULL for every non-gift order → no plain COD order could be stored.
 *  - P0001 "order total does not reconcile" / "only cash on delivery is
 *    enabled" — the phase-1 guard triggers never learned about tips, gift
 *    wrap or wallet payments, so those orders were refused.
 *  - 42703 / 42P01 — a column/table the installed RPC writes does not exist
 *    (a paste-part or a whole migration was skipped).
 */
const REPAIR_FILE = "supabase/migrations/202609160002_order_insert_repair.sql";
const isGuardTriggerRaise = (message: string): boolean =>
  /order total does not reconcile|only cash on delivery is enabled/i.test(message);

export const schemaGapFor = (error: {
  code?: string;
  message?: string;
}): string | null => {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "PGRST202" || /function .*ps_place_order.* does not exist/i.test(message)) {
    return "ps_place_order is not installed — apply the checkout migrations (docs/go-live.md)";
  }
  if (code === "23502") {
    return `an orders column is still NOT NULL (${message.replace(/^null value in column /i, "").split(" of relation")[0]}) — run ${REPAIR_FILE}`;
  }
  if (code === "P0001" && isGuardTriggerRaise(message)) {
    return `the phase-1 order guard triggers are outdated ("${message.trim()}") — run ${REPAIR_FILE}`;
  }
  if (code === "42703" || code === "42P01") {
    return `the installed ps_place_order writes to something this database lacks (${message.trim()}) — run the missing migration (docs/go-live.md, supabase/diagnose.sql)`;
  }
  return null;
};

/** Map an RPC failure to a field-scoped, status-coded placement error (exported for tests). Our RPC raises user-safe messages (P0001); anything else is a 503. */
export const placementErrorFrom = (error: {
  code?: string;
  message?: string;
}): OrderPlacementError => {
  const message = error.message?.trim() || "";
  if (schemaGapFor(error) !== null) {
    // Not a validation problem: the shop's database needs a migration. Say
    // so honestly (no internals, no fake success) — the server log carries
    // the exact SQL error and the file to run.
    return new OrderPlacementError(
      "order",
      "Ordering is temporarily unavailable — the shop is finishing a database update. Please try again in a few minutes, or call the shop to order by phone.",
      503,
    );
  }
  if (error.code === "P0001" && message !== "") {
    const field = /coupon/i.test(message)
      ? "couponCode"
      : /zone/i.test(message)
        ? "zoneId"
        : /qty|quantity|product|variant|stock|left of|empty|shop/i.test(message)
          ? "items"
          : "order";
    return new OrderPlacementError(field, message, 422);
  }
  return new OrderPlacementError(
    "order",
    "Could not place the order — please try again.",
    503,
  );
};

export async function placeLiveOrder(
  draft: ValidOrderDraft,
  snapshot: OrderSnapshot,
): Promise<Order | null> {
  const db = getSupabaseService();
  if (!db) return null;

  const variantByLine = draft.items.map((it) =>
    resolveVariant(snapshot.variants, it.product.id, it.variantLabel),
  );
  const { data: orderId, error } = await db.rpc("ps_place_order", {
    p_order: {
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      area: draft.customer.para || draft.customer.area,
      district: draft.customer.district,
      upazila: draft.customer.upazila,
      para: draft.customer.para,
      address: draft.customer.address,
      note: draft.customer.note,
      zone_id: draft.zone.id,
      lat: draft.geo?.lat ?? null,
      lng: draft.geo?.lng ?? null,
      distance_km: draft.geo?.distanceKm ?? null,
      scheduled_at: draft.scheduledAt ?? null,
      delivery_window: draft.deliveryWindow ?? null,
      is_express: draft.isExpress ?? false,
      is_pickup: draft.isPickup ?? false,
      pickup_slot: draft.pickupSlot ?? null,
      tip_amount: draft.tipAmount ?? 0,
      weight_kg: draft.weightKg ?? 0,
      surcharge_night: draft.surchargeNight ?? 0,
      surcharge_rain: draft.surchargeRain ?? 0,
      surcharge_distance: draft.surchargeDistance ?? 0,
      surcharge_express: draft.surchargeExpress ?? 0,
      surcharge_weight: draft.surchargeWeight ?? 0,
      coupon_code: draft.coupon?.code ?? null,
      // P0 intents only — ps_place_order turns them into money (it computes the
      // flash discount itself, bounds a bundle claim by the settings percentage,
      // prices the wrap fee from settings and proves the referral is a first
      // order before crediting anything).
      is_gift: draft.gift?.isGift ?? false,
      gift_wrap: draft.gift?.wrap ?? "none",
      gift_recipient_name: draft.gift?.recipientName ?? null,
      gift_recipient_phone: draft.gift?.recipientPhone ?? null,
      gift_message: draft.gift?.message ?? null,
      bundle_discount: draft.promo?.kind === "bundle" ? draft.promo.discount : 0,
      referral_code: draft.referral?.code ?? null,
      // P1 #8 — wallet payment intents: the RPC validates the method against
      // the ops wallets and requires a TRXID for bkash/nagad.
      payment_method: draft.paymentMethod ?? "cod",
      payment_ref: draft.paymentRef ?? null,
    },
    p_items: draft.items.map((it, i) => ({
      product_id: it.product.id,
      variant_id: variantByLine[i]?.id ?? null,
      variant_label: it.variantLabel,
      qty: it.qty,
    })),
  });
  if (error || !orderId) {
    const raw = (error ?? {}) as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };
    // The customer only ever sees the mapped message; the log keeps the real
    // SQLSTATE so a "Could not place the order" report can be diagnosed from
    // Vercel → Logs without guessing.
    const gap = schemaGapFor(raw);
    console.error(
      "[orders] ps_place_order failed",
      JSON.stringify({
        code: raw.code ?? null,
        message: raw.message ?? (orderId ? null : "rpc returned no order id"),
        details: raw.details ?? null,
        hint: raw.hint ?? null,
        ...(gap ? { schemaGap: gap } : {}),
      }),
    );
    throw placementErrorFrom(raw);
  }
  // Read back the full bundle for the confirmation + tracking views.
  const placed = await findLiveOrderById(db, orderId as string, draft.customer.phone);
  if (!placed) {
    // The row exists (the RPC committed) but the read-back failed — say so in
    // the log rather than letting the route emit the generic 503 silently.
    console.error(
      "[orders] order placed but read-back failed",
      JSON.stringify({ orderId, phone: draft.customer.phone }),
    );
  }
  return placed;
}

/** Full order bundle → domain Order. Works with service or staff clients. */
export const toDomain = async (
  db: SupabaseClient,
  order: DbOrder,
): Promise<Order | null> => {
  const [itemsRes, historyRes, zoneRes, couponRes] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", order.id),
    db
      .from("order_status_history")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at"),
    db.from("delivery_zones").select("name,eta_label").eq("id", order.zone_id).single(),
    order.coupon_id
      ? db.from("coupons").select("code").eq("id", order.coupon_id).single()
      : Promise.resolve({ data: null as { code: string } | null }),
  ]);
  if (itemsRes.error || historyRes.error) return null;
  const items = (itemsRes.data ?? []) as DbOrderItem[];
  const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))] as string[];
  let products = new Map<string, { slug: string; image: string; warrantyDays?: number }>();
  if (productIds.length > 0) {
    const [pRes, mRes] = await Promise.all([
      db.from("products").select("id,slug,warranty_days").in("id", productIds),
      db
        .from("product_media")
        .select("product_id,url")
        .eq("type", "image")
        .in("product_id", productIds)
        .order("sort_order"),
    ]);
    const slugs = new Map<string, string>(
      ((pRes.data ?? []) as { id: string; slug: string }[]).map((p) => [p.id, p.slug]),
    );
    const warranties = new Map<string, number | undefined>(
      ((pRes.data ?? []) as { id: string; warranty_days: number | null }[]).map(
        (p) => [p.id, p.warranty_days ?? undefined],
      ),
    );
    const images = new Map<string, string>();
    for (const m of ((mRes.data ?? []) as { product_id: string; url: string }[])) {
      if (!images.has(m.product_id)) images.set(m.product_id, m.url);
    }
    products = new Map(
      productIds.map((id) => [
        id,
        {
          slug: slugs.get(id) ?? "",
          image: images.get(id) ?? "",
          warrantyDays: warranties.get(id),
        },
      ]),
    );
  }
  const zone = (zoneRes.data ?? {}) as { name?: string; eta_label?: string };
  const domain = mapOrder({
    order,
    items,
    history: (historyRes.data ?? []) as DbOrderHistory[],
    zoneName: zone.name ?? order.zone_id,
    etaLabel: zone.eta_label ?? "",
    couponCode: (couponRes.data as { code: string } | null)?.code,
    products,
  });
  if (!domain) return null;
  if (order.delivery_code) domain.deliveryCode = order.delivery_code;

  // P1 #13: a delivered parent carries its linked return/exchange pickup,
  // so the customer's tracking page can show the reverse leg's progress.
  if (!order.is_return) {
    const { data: child } = await db
      .from("orders")
      .select("order_no,status,return_status")
      .eq("return_parent_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const c = child as
      | { order_no: string; status: string; return_status: string }
      | null;
    if (c && c.return_status && c.return_status !== "rejected") {
      domain.returnChild = {
        orderNo: c.order_no,
        status: c.status as Order["status"],
        returnStatus: c.return_status,
      };
    }
  }

  // A return pickup shows the public number of the order it returns.
  if (order.is_return && order.return_parent_id) {
    const { data: parent } = await db
      .from("orders")
      .select("order_no")
      .eq("id", order.return_parent_id)
      .maybeSingle();
    const p = parent as { order_no: string } | null;
    if (p) domain.returnParentOrderNo = p.order_no;
  }

  // Slice 9 rider-leg: attach the assigned rider when dispatch has started.
  if (["courier-assigned", "out-for-delivery", "delivered"].includes(domain.status)) {
    const { data: assignment } = await db
      .from("delivery_assignments")
      .select("rider_id")
      .eq("order_id", order.id)
      .order("offered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const riderId = (assignment as { rider_id?: string } | null)?.rider_id;
    if (riderId) {
      const { data: rider } = await db
        .from("riders")
        .select("id,name,phone,rating_avg,rating_count")
        .eq("id", riderId)
        .maybeSingle();
      const r = rider as
        | {
            id: string;
            name: string;
            phone: string;
            rating_avg: number;
            rating_count: number;
          }
        | null;
      if (r) {
        domain.rider = {
          id: r.id,
          name: r.name,
          phone: r.phone,
          ratingAvg: r.rating_avg,
          ratingCount: r.rating_count,
        };
      }
    }
  }
  return domain;
};

const findLiveOrderById = async (
  db: SupabaseClient,
  id: string,
  phone: string,
): Promise<Order | null> => {
  const { data, error } = await db.from("orders").select("*").eq("id", id).single();
  if (error || !data) return null;
  const order = data as DbOrder;
  if (normalizePhone(order.customer_phone) !== normalizePhone(phone)) return null;
  return toDomain(db, order);
};

/**
 * Guest tracking lookup: the order number is public-ish (printed on the
 * confirmation), the phone proves ownership. Null when unconfigured,
 * unknown, or the phone does not match — callers must not distinguish.
 */
export async function findLiveOrder(
  orderNo: string,
  phone: string,
): Promise<Order | null> {
  const db = getSupabaseService();
  if (!db) return null;
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) return null;
  const order = data as DbOrder;
  if (
    normalizePhone(order.customer_phone) === "" ||
    normalizePhone(order.customer_phone) !== normalizePhone(phone)
  ) {
    return null;
  }
  return toDomain(db, order);
}
