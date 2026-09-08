/**
 * Server-side order pipeline (blueprint §33–34, §75).
 *
 * - `loadOrderSnapshot()` — one batched read of everything checkout needs
 *   to price an order (products + variants + media + zones + coupons).
 * - `placeLiveOrder()` — persists a validated draft: orders row, item
 *   snapshots, the opening history entry, coupon usage and variant
 *   reservation. Money comes from the draft, which the validator priced
 *   from this same snapshot — the client never sets a total.
 * - `findLiveOrder()` — phone-gated tracking lookup. Returns null on any
 *   mismatch so callers cannot probe which half of (id, phone) was wrong.
 *
 * All functions return null when the service role is unconfigured; routes
 * answer with demo-mode responses in that case. Stock and coupon updates
 * are best-effort read-modify-write in this phase (documented in
 * docs/backend.md) — the follow-up moves them into one RPC.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "../supabase-server";
import type { Coupon } from "../coupons";
import type { DeliveryZone, Product } from "../catalog";
import { mapCoupon, mapOrder, mapProduct, mapZone } from "./mappers";
import type {
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbProduct,
  DbVariant,
  DbZone,
} from "./types";
import type { Order } from "../orders";
import { normalizePhone } from "../orders";
import type { ValidOrderDraft } from "../order-validation";

export interface OrderSnapshot {
  products: Product[];
  zones: DeliveryZone[];
  coupons: Coupon[];
  variants: DbVariant[];
  mediaByProduct: Map<string, string>;
}

export async function loadOrderSnapshot(): Promise<OrderSnapshot | null> {
  const db = getSupabaseService();
  if (!db) return null;

  const [productsRes, variantsRes, mediaRes, zonesRes, couponsRes] =
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
    ]);
  if (
    productsRes.error ||
    variantsRes.error ||
    mediaRes.error ||
    zonesRes.error ||
    couponsRes.error
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
  return {
    products,
    zones: ((zonesRes.data ?? []) as DbZone[]).map(mapZone),
    coupons: ((couponsRes.data ?? []) as DbCoupon[]).map(mapCoupon),
    variants,
    mediaByProduct,
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

const reserveStock = async (
  db: SupabaseClient,
  variant: DbVariant,
  qty: number,
  productName: string,
): Promise<void> => {
  const { data, error } = await db
    .from("product_variants")
    .select("stock,reserved")
    .eq("id", variant.id)
    .single();
  if (error || !data) {
    throw new OrderPlacementError("items", `“${productName}” just sold out.`);
  }
  const available = (data.stock as number) - (data.reserved as number);
  if (available < qty) {
    throw new OrderPlacementError(
      "items",
      `Only ${Math.max(0, available)} left of “${productName}” in that variant.`,
    );
  }
  const { error: updateError } = await db
    .from("product_variants")
    .update({ reserved: (data.reserved as number) + qty })
    .eq("id", variant.id);
  if (updateError) {
    throw new OrderPlacementError(
      "items",
      `Could not reserve “${productName}” — please try again.`,
      503,
    );
  }
};

const recordCouponUse = async (
  db: SupabaseClient,
  couponId: string,
): Promise<void> => {
  // Atomic increment + limit guard when migration 002 is applied …
  const { error: rpcError } = await db.rpc("ps_use_coupon", {
    p_coupon_id: couponId,
  });
  if (!rpcError) return;
  // … otherwise a plain increment (phase-1 fallback, documented).
  const { data, error } = await db
    .from("coupons")
    .select("used")
    .eq("id", couponId)
    .single();
  if (error || !data) return;
  await db
    .from("coupons")
    .update({ used: (data.used as number) + 1 })
    .eq("id", couponId);
};

export async function placeLiveOrder(
  draft: ValidOrderDraft,
  snapshot: OrderSnapshot,
): Promise<Order | null> {
  const db = getSupabaseService();
  if (!db) return null;

  // 1. Reserve stock first so a failure never leaves a half-written order.
  const variantByLine = draft.items.map((it) =>
    resolveVariant(snapshot.variants, it.product.id, it.variantLabel),
  );
  for (let i = 0; i < draft.items.length; i++) {
    const variant = variantByLine[i];
    if (variant) {
      await reserveStock(db, variant, draft.items[i].qty, draft.items[i].product.name);
    }
  }

  // 2. Order row — order_no is assigned by the ps_assign_order_no trigger.
  const { data: created, error: orderError } = await db
    .from("orders")
    .insert({
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      area: draft.customer.area,
      address: draft.customer.address,
      note: draft.customer.note,
      zone_id: draft.zone.id,
      subtotal: draft.subtotal,
      delivery_charge: draft.deliveryCharge,
      discount: draft.discount,
      coupon_id: draft.coupon?.id ?? null,
      total: draft.total,
      payment: "cod",
      status: "pending",
    })
    .select("*")
    .single();
  if (orderError || !created) {
    throw new OrderPlacementError(
      "order",
      "Could not place the order — please try again.",
      503,
    );
  }
  const order = created as DbOrder;

  // 3. Item snapshots (§75) + opening history entry (§34).
  const { error: itemsError } = await db.from("order_items").insert(
    draft.items.map((it, i) => ({
      order_id: order.id,
      product_id: it.product.id,
      variant_id: variantByLine[i]?.id ?? null,
      name: it.product.name,
      sku: it.product.sku,
      variant: it.variantLabel,
      unit_price: it.unitPrice,
      qty: it.qty,
    })),
  );
  if (itemsError) {
    throw new OrderPlacementError(
      "order",
      "Could not place the order — please try again.",
      503,
    );
  }
  await db.from("order_status_history").insert({
    order_id: order.id,
    status: "pending",
    note: "Placed via storefront checkout",
  });

  // 4. Coupon usage (best-effort — the discount is already snapshotted).
  if (draft.coupon) {
    await recordCouponUse(db, draft.coupon.id);
  }

  // 5. Read back the full bundle for the confirmation + tracking views.
  return findLiveOrderById(db, order.id, draft.customer.phone);
}

const toDomain = async (
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
  let products = new Map<string, { slug: string; image: string }>();
  if (productIds.length > 0) {
    const [pRes, mRes] = await Promise.all([
      db.from("products").select("id,slug").in("id", productIds),
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
    const images = new Map<string, string>();
    for (const m of ((mRes.data ?? []) as { product_id: string; url: string }[])) {
      if (!images.has(m.product_id)) images.set(m.product_id, m.url);
    }
    products = new Map(
      productIds.map((id) => [id, { slug: slugs.get(id) ?? "", image: images.get(id) ?? "" }]),
    );
  }
  const zone = (zoneRes.data ?? {}) as { name?: string; eta_label?: string };
  return mapOrder({
    order,
    items,
    history: (historyRes.data ?? []) as DbOrderHistory[],
    zoneName: zone.name ?? order.zone_id,
    etaLabel: zone.eta_label ?? "",
    couponCode: (couponRes.data as { code: string } | null)?.code,
    products,
  });
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
