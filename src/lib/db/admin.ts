/**
 * Staff data-access layer (blueprint §32–33, §56–58, §71–74).
 *
 * Every helper takes the RLS-bound staff client from requireStaff(), so
 * database policies — not route code — decide what staff may touch.
 * Validation errors throw AdminInputError (400/404/409); unexpected
 * database failures throw plain Errors (503 at the route).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, DeliveryZone, Product, Shop } from "../catalog";
import { slugify } from "../catalog-store";
import type { Coupon } from "../coupons";
import type { Order, OrderStatus } from "../orders";
import type { Review } from "../review-store";
import {
  mapCategory,
  mapCoupon,
  mapOrder,
  mapProduct,
  mapReview,
  mapShop,
  mapZone,
} from "./mappers";
import { toDomain } from "./orders";
import type {
  DbCategory,
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbProduct,
  DbReview,
  DbShop,
  DbVariant,
  DbZone,
} from "./types";

export class AdminInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const cleanInt = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export interface OrderFilters {
  status?: string;
  q?: string;
  limit?: number;
}

/** Staff order list — 5 queries total, not N+1 per order. */
export async function listOrders(
  db: SupabaseClient,
  filters: OrderFilters,
): Promise<Order[]> {
  const limit = Math.max(1, Math.min(200, cleanInt(filters.limit, 100)));
  let query = db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const status = clean(filters.status, 32);
  if (status !== "") query = query.eq("status", status);
  const q = clean(filters.q, 64);
  if (q !== "") {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `order_no.ilike.${like},customer_name.ilike.${like},customer_phone.ilike.${like}`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error("order list failed");
  const rows = (data ?? []) as DbOrder[];
  if (rows.length === 0) return [];

  const ids = rows.map((o) => o.id);
  const [itemsRes, historyRes, zonesRes, couponsRes] = await Promise.all([
    db.from("order_items").select("*").in("order_id", ids),
    db
      .from("order_status_history")
      .select("*")
      .in("order_id", ids)
      .order("created_at"),
    db.from("delivery_zones").select("id,name,eta_label"),
    db.from("coupons").select("id,code"),
  ]);
  if (itemsRes.error || historyRes.error) throw new Error("order list failed");
  const itemsByOrder = new Map<string, DbOrderItem[]>();
  for (const it of ((itemsRes.data ?? []) as DbOrderItem[])) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }
  const historyByOrder = new Map<string, DbOrderHistory[]>();
  for (const h of ((historyRes.data ?? []) as DbOrderHistory[])) {
    const list = historyByOrder.get(h.order_id) ?? [];
    list.push(h);
    historyByOrder.set(h.order_id, list);
  }
  const zones = new Map<string, { name: string; eta_label: string }>(
    ((zonesRes.data ?? []) as { id: string; name: string; eta_label: string }[]).map(
      (z) => [z.id, z],
    ),
  );
  const couponCodes = new Map<string, string>(
    ((couponsRes.data ?? []) as { id: string; code: string }[]).map((c) => [
      c.id,
      c.code,
    ]),
  );
  // Product slugs/images for the item snapshots.
  const productIds = [
    ...new Set(
      ((itemsRes.data ?? []) as DbOrderItem[])
        .map((it) => it.product_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const products = new Map<string, { slug: string; image: string }>();
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
      ((pRes.data ?? []) as { id: string; slug: string }[]).map((p) => [
        p.id,
        p.slug,
      ]),
    );
    const images = new Map<string, string>();
    for (const m of ((mRes.data ?? []) as { product_id: string; url: string }[])) {
      if (!images.has(m.product_id)) images.set(m.product_id, m.url);
    }
    for (const id of productIds) {
      products.set(id, { slug: slugs.get(id) ?? "", image: images.get(id) ?? "" });
    }
  }

  return rows.map((order) => {
    const zone = zones.get(order.zone_id);
    return mapOrder({
      order,
      items: itemsByOrder.get(order.id) ?? [],
      history: historyByOrder.get(order.id) ?? [],
      zoneName: zone?.name ?? order.zone_id,
      etaLabel: zone?.eta_label ?? "",
      couponCode: order.coupon_id
        ? couponCodes.get(order.coupon_id)
        : undefined,
      products,
    });
  });
}

export async function getOrderDetail(
  db: SupabaseClient,
  orderNo: string,
): Promise<Order> {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) throw new AdminInputError("Order not found.", 404);
  const order = await toDomain(db, data as DbOrder);
  if (!order) throw new Error("order detail failed");
  return order;
}

/**
 * Staff status transition through ps_advance_order — the database owns the
 * §34 machine, so illegal moves fail here even if the UI allowed them.
 */
export async function advanceOrderAsStaff(
  db: SupabaseClient,
  orderNo: string,
  to: OrderStatus,
  note?: string,
): Promise<Order> {
  const { data, error } = await db
    .from("orders")
    .select("id")
    .eq("order_no", orderNo.trim().toUpperCase())
    .single();
  if (error || !data) throw new AdminInputError("Order not found.", 404);
  const { error: rpcError } = await db.rpc("ps_advance_order", {
    p_order_id: (data as { id: string }).id,
    p_to: to,
    p_note: note?.trim().slice(0, 300) ?? null,
  });
  if (rpcError) {
    const msg = rpcError.message.toLowerCase();
    if (msg.includes("forbidden")) {
      throw new AdminInputError("Staff role required.", 403);
    }
    if (msg.includes("illegal transition") || msg.includes("cannot cancel")) {
      throw new AdminInputError(
        "That status change is not allowed from here.",
        422,
      );
    }
    throw new AdminInputError("Could not update the order.", 422);
  }
  return getOrderDetail(db, orderNo);
}

/* ------------------------------------------------------------------ */
/* Products (incl. drafts — staff see what the storefront cannot)      */
/* ------------------------------------------------------------------ */

export async function listProductsFull(
  db: SupabaseClient,
): Promise<{ products: Product[]; categories: Category[] }> {
  const [productsRes, variantsRes, mediaRes, categoriesRes] = await Promise.all(
    [
      db.from("products").select("*").order("created_at", { ascending: false }),
      db.from("product_variants").select("*"),
      db.from("product_media").select("*").order("sort_order"),
      db.from("categories").select("*").order("sort_order"),
    ],
  );
  if (productsRes.error || variantsRes.error || mediaRes.error || categoriesRes.error) {
    throw new Error("product list failed");
  }
  const variants = (variantsRes.data ?? []) as DbVariant[];
  const media = (mediaRes.data ?? []) as DbMedia[];
  return {
    products: ((productsRes.data ?? []) as DbProduct[]).map((p) =>
      mapProduct({
        product: p,
        variants: variants.filter((v) => v.product_id === p.id),
        media: media.filter((m) => m.product_id === p.id),
      }),
    ),
    categories: ((categoriesRes.data ?? []) as DbCategory[]).map(mapCategory),
  };
}

export interface ProductInput {
  name: string;
  slug?: string;
  sku: string;
  category: string;
  subCategory?: string;
  shortDescription?: string;
  description?: string[];
  details?: { label: string; value: string }[];
  price: number;
  compareAtPrice?: number | null;
  colors?: string[];
  sizes?: string[];
  featured?: boolean;
  isNew?: boolean;
  inStock?: boolean;
  lowStock?: boolean;
  media?: { src: string; alt?: string }[];
  video?: { youtubeId: string; label?: string };
  status?: "draft" | "published";
  active?: boolean;
  /** Desired TOTAL stock across variants (single-number admin UI). */
  stock?: number;
  seo?: { title?: string; description?: string };
}

const SLUG_RE = /^[a-z0-9\u0980-\u09ff]+(?:-[a-z0-9\u0980-\u09ff]+)*$/;

const sanitizeProductInput = (
  raw: unknown,
  partial: boolean,
): ProductInput & { nameBn?: string } => {
  const body = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => clean(v, max);
  const strList = (v: unknown, maxEach: number, maxCount: number): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, maxEach))
          .filter((x) => x !== ""))].slice(0, maxCount)
      : [];
  const out: ProductInput & { nameBn?: string } = {
    name: str(body.name, 160),
    slug: typeof body.slug === "string" ? str(body.slug, 160) : undefined,
    sku: str(body.sku, 64),
    category: str(body.category, 64),
    subCategory: str(body.subCategory, 80),
    shortDescription: str(body.shortDescription, 400),
    description: Array.isArray(body.description)
      ? body.description
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, 2000))
          .filter((x) => x !== "")
          .slice(0, 12)
      : [],
    details: Array.isArray(body.details)
      ? body.details
          .filter((d): d is { label: string; value: string } =>
            !!d && typeof (d as { label: unknown }).label === "string",
          )
          .map((d) => ({
            label: str(d.label, 60),
            value: str(d.value, 200),
          }))
          .filter((d) => d.label !== "")
          .slice(0, 20)
      : [],
    price: cleanInt(body.price, -1),
    compareAtPrice:
      body.compareAtPrice === null || body.compareAtPrice === undefined
        ? null
        : cleanInt(body.compareAtPrice, -1),
    colors: strList(body.colors, 60, 12),
    sizes: strList(body.sizes, 24, 16),
    featured: body.featured === true,
    isNew: body.isNew === true,
    inStock: body.inStock !== false,
    lowStock: body.lowStock === true,
    media: Array.isArray(body.media)
      ? body.media
          .filter((m): m is { src: string; alt?: string } =>
            !!m && typeof (m as { src: unknown }).src === "string",
          )
          .map((m) => ({ src: str(m.src, 500), alt: str(m.alt, 200) }))
          .filter((m) => m.src !== "")
          .slice(0, 12)
      : [],
    status: body.status === "published" ? "published" : "draft",
    active: body.active !== false,
    stock: body.stock === undefined ? undefined : Math.max(0, cleanInt(body.stock)),
    seo: {
      title: str((body.seo as { title?: unknown } | undefined)?.title, 160) || undefined,
      description:
        str((body.seo as { description?: unknown } | undefined)?.description, 300) || undefined,
    },
  };
  if (typeof body.nameBn === "string") out.nameBn = str(body.nameBn, 160);
  if (
    body.video &&
    typeof (body.video as { youtubeId?: unknown }).youtubeId === "string"
  ) {
    const v = body.video as { youtubeId: string; label?: string };
    if (/^[A-Za-z0-9_-]{11}$/.test(v.youtubeId)) {
      out.video = { youtubeId: v.youtubeId, label: str(v.label, 160) };
    }
  }
  void partial;
  return out;
};

const validateProductInput = (
  input: ProductInput,
  categories: { id: string }[],
): void => {
  if (input.name.length < 2) throw new AdminInputError("Product name is too short.");
  if (input.slug !== undefined && input.slug !== "" && !SLUG_RE.test(input.slug)) {
    throw new AdminInputError("Slug may only contain letters, numbers and dashes.");
  }
  if (input.sku === "") throw new AdminInputError("SKU is required.");
  if (!categories.some((c) => c.id === input.category)) {
    throw new AdminInputError("That category does not exist.");
  }
  if (input.price < 0) throw new AdminInputError("Price must be 0 or more (paisa).");
  if (input.compareAtPrice !== null && input.compareAtPrice !== undefined) {
    if (input.compareAtPrice < 0) {
      throw new AdminInputError("Compare-at price must be 0 or more.");
    }
    if (input.compareAtPrice > 0 && input.compareAtPrice <= input.price) {
      throw new AdminInputError("Compare-at price must be above the selling price.");
    }
  }
  for (const m of input.media ?? []) {
    if (!(m.src.startsWith("/") || m.src.startsWith("https://"))) {
      throw new AdminInputError("Media URLs must be site paths or https links.");
    }
  }
};

/**
 * Variant grid sync. Stock strategy (documented for the single-number UI):
 * - grid unchanged → every variant keeps its stock/reserved;
 * - grid changed or new product → desired total is split evenly;
 * - desired total given + grid unchanged → the difference lands on the
 *   first variant (never below its reservations).
 */
const syncVariants = async (
  db: SupabaseClient,
  productId: string,
  input: ProductInput,
  desiredTotal: number | undefined,
): Promise<void> => {
  const colors = input.colors?.length ? input.colors : [""];
  const sizes = input.sizes?.length ? input.sizes : [""];
  const wanted = new Map<string, { color: string; size: string }>();
  for (const color of colors) {
    for (const size of sizes) {
      wanted.set(`${color}::${size}`, { color, size });
    }
  }
  const { data, error } = await db
    .from("product_variants")
    .select("*")
    .eq("product_id", productId);
  if (error) throw new Error("variant read failed");
  const existing = (data ?? []) as DbVariant[];
  const existingKeys = new Set(
    existing.map((v) => `${v.color}::${v.size}`),
  );
  const sameGrid =
    existing.length === wanted.size &&
    [...wanted.keys()].every((k) => existingKeys.has(k));

  if (sameGrid && existing.length > 0) {
    // Keep per-variant stock; optionally nudge the total via row one.
    const currentTotal = existing.reduce((s, v) => s + v.stock, 0);
    const target = desiredTotal ?? currentTotal;
    const first = [...existing].sort((a, b) =>
      a.color.localeCompare(b.color),
    )[0];
    const nextFirst = Math.max(first.reserved, first.stock + (target - currentTotal));
    const { error: upError } = await db
      .from("product_variants")
      .update({ price: input.price, stock: nextFirst, active: true })
      .eq("id", first.id);
    if (upError) throw new Error("variant update failed");
    const rest = existing.filter((v) => v.id !== first.id);
    if (rest.length > 0) {
      const { error: restError } = await db
        .from("product_variants")
        .update({ price: input.price, active: true })
        .in("id", rest.map((v) => v.id));
      if (restError) throw new Error("variant update failed");
    }
    return;
  }

  // New/changed grid: retire missing rows (or deactivate when reserved)…
  for (const v of existing) {
    if (wanted.has(`${v.color}::${v.size}`)) continue;
    if (v.reserved > 0) {
      await db.from("product_variants").update({ active: false }).eq("id", v.id);
    } else {
      await db.from("product_variants").delete().eq("id", v.id);
    }
  }
  // …and upsert the wanted ones with evenly split stock.
  const total = desiredTotal ?? 12;
  const per = Math.floor(total / wanted.size);
  let remainder = total - per * wanted.size;
  let n = 0;
  for (const { color, size } of wanted.values()) {
    n += 1;
    const stock = per + (remainder > 0 ? (remainder -= 1, 1) : 0);
    const row = existing.find((v) => v.color === color && v.size === size);
    if (row) {
      const { error: upError } = await db
        .from("product_variants")
        .update({
          price: input.price,
          stock: Math.max(row.reserved, stock),
          active: true,
        })
        .eq("id", row.id);
      if (upError) throw new Error("variant update failed");
    } else {
      const { error: insError } = await db.from("product_variants").insert({
        product_id: productId,
        color,
        size,
        sku: `${input.sku}-V${n}`,
        price: input.price,
        stock,
        reserved: 0,
        active: true,
      });
      if (insError) throw new Error("variant insert failed");
    }
  }
};

const syncMedia = async (
  db: SupabaseClient,
  productId: string,
  input: ProductInput,
): Promise<void> => {
  const { error: delError } = await db
    .from("product_media")
    .delete()
    .eq("product_id", productId);
  if (delError) throw new Error("media replace failed");
  const rows: {
    product_id: string;
    type: string;
    url: string;
    alt_text: string;
    sort_order: number;
  }[] = (input.media ?? []).map((m, i) => ({
    product_id: productId,
    type: "image",
    url: m.src,
    alt_text: m.alt || input.name,
    sort_order: i,
  }));
  if (input.video) {
    rows.push({
      product_id: productId,
      type: "youtube",
      url: `https://www.youtube.com/watch?v=${input.video.youtubeId}`,
      alt_text: input.video.label || input.name,
      sort_order: rows.length,
    });
  }
  if (rows.length === 0) return;
  const { error } = await db.from("product_media").insert(rows);
  if (error) throw new Error("media insert failed");
};

export const readProductBundle = async (
  db: SupabaseClient,
  id: string,
): Promise<Product> => {
  const [pRes, vRes, mRes] = await Promise.all([
    db.from("products").select("*").eq("id", id).single(),
    db.from("product_variants").select("*").eq("product_id", id),
    db.from("product_media").select("*").eq("product_id", id).order("sort_order"),
  ]);
  if (pRes.error || !pRes.data) throw new AdminInputError("Product not found.", 404);
  return mapProduct({
    product: pRes.data as DbProduct,
    variants: (vRes.data ?? []) as DbVariant[],
    media: (mRes.data ?? []) as DbMedia[],
  });
};

export async function createProduct(
  db: SupabaseClient,
  raw: unknown,
  shopId?: string,
): Promise<Product> {
  const input = sanitizeProductInput(raw, false);
  const { data: cats } = await db.from("categories").select("id");
  validateProductInput(input, (cats ?? []) as { id: string }[]);
  // Every product belongs to exactly one shop (004 NOT NULL). Vendors pass
  // their own shop; staff creates land on shop #1 (the platform catalog).
  let resolvedShop = (shopId ?? "").trim();
  if (resolvedShop === "") {
    const { data: first } = await db
      .from("shops")
      .select("id")
      .eq("slug", "prosanti-direct")
      .single();
    resolvedShop = ((first ?? {}) as { id?: string }).id ?? "";
    if (resolvedShop === "") throw new Error("shop #1 missing");
  }
  const slugBase =
    input.slug && input.slug !== "" ? input.slug : slugify(input.name);
  const { data: dupe } = await db
    .from("products")
    .select("id")
    .or(`slug.eq.${slugBase},sku.eq.${input.sku}`)
    .limit(1);
  if (dupe && dupe.length > 0) {
    throw new AdminInputError("Slug or SKU is already in use.", 409);
  }
  const { data, error } = await db
    .from("products")
    .insert({
      shop_id: resolvedShop,
      slug: slugBase,
      name: input.name,
      name_bn: (input as { nameBn?: string }).nameBn ?? "",
      sku: input.sku,
      category_id: input.category,
      subcategory: input.subCategory ?? "",
      short_description: input.shortDescription ?? "",
      description: (input.description ?? []).join("\n\n"),
      details: input.details ?? [],
      price: input.price,
      compare_at_price:
        input.compareAtPrice && input.compareAtPrice > 0 ? input.compareAtPrice : null,
      featured: input.featured ?? false,
      is_new: input.isNew ?? false,
      in_stock: input.inStock ?? true,
      low_stock: input.lowStock ?? false,
      status: input.status ?? "draft",
      active: input.active ?? true,
      seo_title: input.seo?.title ?? null,
      seo_description: input.seo?.description ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      throw new AdminInputError("Slug or SKU is already in use.", 409);
    }
    throw new Error("product insert failed");
  }
  const id = (data as { id: string }).id;
  await syncVariants(db, id, input, input.stock);
  await syncMedia(db, id, input);
  return readProductBundle(db, id);
}

export async function updateProduct(
  db: SupabaseClient,
  id: string,
  raw: unknown,
): Promise<Product> {
  const { data: existing, error: readError } = await db
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !existing) throw new AdminInputError("Product not found.", 404);
  const row = existing as DbProduct;
  const input = sanitizeProductInput(raw, true);
  const { data: cats } = await db.from("categories").select("id");
  // PATCH semantics: blank fields fall back to the stored row.
  const merged: ProductInput = {
    ...input,
    name: input.name || row.name,
    sku: input.sku || row.sku,
    category: input.category || row.category_id,
  };
  validateProductInput(merged, (cats ?? []) as { id: string }[]);
  const nextSlug =
    input.slug && input.slug !== "" ? input.slug : row.slug;
  if (nextSlug !== row.slug) {
    const { data: dupe } = await db
      .from("products")
      .select("id")
      .eq("slug", nextSlug)
      .neq("id", id)
      .limit(1);
    if (dupe && dupe.length > 0) {
      throw new AdminInputError("That slug is already in use.", 409);
    }
  }
  if (merged.sku !== row.sku) {
    const { data: dupe } = await db
      .from("products")
      .select("id")
      .eq("sku", merged.sku)
      .neq("id", id)
      .limit(1);
    if (dupe && dupe.length > 0) {
      throw new AdminInputError("That SKU is already in use.", 409);
    }
  }
  const patch: Record<string, unknown> = {
    slug: nextSlug,
    name: merged.name,
    sku: merged.sku,
    category_id: merged.category,
    price: merged.price,
    status: (raw as { status?: string })?.status ?? row.status,
    active: (raw as { active?: boolean })?.active ?? row.active,
    featured: (raw as { featured?: boolean })?.featured ?? row.featured,
    is_new: (raw as { isNew?: boolean })?.isNew ?? row.is_new,
    in_stock: (raw as { inStock?: boolean })?.inStock ?? row.in_stock,
    low_stock: (raw as { lowStock?: boolean })?.lowStock ?? row.low_stock,
  };
  const rawRec = (raw ?? {}) as Record<string, unknown>;
  if (rawRec.nameBn !== undefined) {
    patch.name_bn = typeof rawRec.nameBn === "string" ? rawRec.nameBn.trim().slice(0, 160) : "";
  }
  if (rawRec.subCategory !== undefined) patch.subcategory = merged.subCategory ?? "";
  if (rawRec.shortDescription !== undefined) {
    patch.short_description = merged.shortDescription ?? "";
  }
  if (rawRec.description !== undefined) {
    patch.description = (merged.description ?? []).join("\n\n");
  }
  if (rawRec.details !== undefined) patch.details = merged.details ?? [];
  if (rawRec.compareAtPrice !== undefined) {
    patch.compare_at_price =
      merged.compareAtPrice && merged.compareAtPrice > 0 ? merged.compareAtPrice : null;
  }
  if (rawRec.seo !== undefined) {
    patch.seo_title = merged.seo?.title ?? null;
    patch.seo_description = merged.seo?.description ?? null;
  }
  const { error } = await db.from("products").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new AdminInputError("Slug or SKU is already in use.", 409);
    }
    throw new Error("product update failed");
  }
  if (rawRec.colors !== undefined || rawRec.sizes !== undefined || rawRec.price !== undefined || rawRec.stock !== undefined || rawRec.sku !== undefined) {
    // Variant grid inputs fall back to the CURRENT grid (not blank).
    const { data: current } = await db
      .from("product_variants")
      .select("color,size")
      .eq("product_id", id)
      .eq("active", true);
    const cur = (current ?? []) as { color: string; size: string }[];
    const gridInput: ProductInput = {
      ...merged,
      colors:
        rawRec.colors !== undefined
          ? merged.colors
          : [...new Set(cur.map((v) => v.color).filter((c) => c !== ""))],
      sizes:
        rawRec.sizes !== undefined
          ? merged.sizes
          : [...new Set(cur.map((v) => v.size).filter((s) => s !== ""))],
      price: merged.price,
      sku: merged.sku,
      name: merged.name,
    };
    await syncVariants(db, id, gridInput, merged.stock);
  }
  if (rawRec.media !== undefined || rawRec.video !== undefined) {
    await syncMedia(db, id, merged);
  }
  return readProductBundle(db, id);
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export async function listCategoriesFull(
  db: SupabaseClient,
): Promise<Category[]> {
  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("sort_order");
  if (error) throw new Error("category list failed");
  return ((data ?? []) as DbCategory[]).map(mapCategory);
}

const CATEGORY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function upsertCategory(
  db: SupabaseClient,
  raw: unknown,
): Promise<Category> {
  const body = (raw ?? {}) as {
    id?: string;
    name?: string;
    nameBn?: string;
    tagline?: string;
    image?: string;
    subCategories?: string[];
    active?: boolean;
  };
  const name = clean(body.name, 80);
  if (name.length < 2) throw new AdminInputError("Category name is too short.");
  let id = clean(body.id, 64).toLowerCase();
  if (id !== "" && !CATEGORY_ID_RE.test(id)) {
    throw new AdminInputError("Category id may only contain a–z, 0–9 and dashes.");
  }
  if (id === "") id = slugify(name);
  const { data: existing } = await db
    .from("categories")
    .select("id,sort_order")
    .eq("id", id)
    .single();
  const row = {
    id,
    name,
    name_bn: clean(body.nameBn, 80),
    tagline: clean(body.tagline, 200),
    image: clean(body.image, 500),
    subcategories: Array.isArray(body.subCategories)
      ? [...new Set(
          body.subCategories
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim().slice(0, 60))
            .filter((s) => s !== ""),
        )].slice(0, 24)
      : [],
    active: body.active !== false,
  };
  if (existing) {
    const { error } = await db.from("categories").update(row).eq("id", id);
    if (error) throw new Error("category update failed");
  } else {
    const { data: maxRow } = await db
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const { error } = await db.from("categories").insert({
      ...row,
      sort_order: ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1,
    });
    if (error) {
      if (error.code === "23505") {
        throw new AdminInputError("That category id is taken.", 409);
      }
      throw new Error("category insert failed");
    }
  }
  const { data, error: readError } = await db
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !data) throw new Error("category read failed");
  return mapCategory(data as DbCategory);
}

export async function moveCategoryRow(
  db: SupabaseClient,
  id: string,
  dir: -1 | 1,
): Promise<Category[]> {
  const list = await listCategoriesFull(db);
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) {
    throw new AdminInputError("Cannot move that category there.");
  }
  // Swap sort_order of the two neighbours.
  const { data: rows } = await db
    .from("categories")
    .select("id,sort_order")
    .in("id", [list[i].id, list[j].id]);
  const orderOf = new Map(
    ((rows ?? []) as { id: string; sort_order: number }[]).map((r) => [r.id, r.sort_order]),
  );
  await db
    .from("categories")
    .update({ sort_order: orderOf.get(list[j].id) ?? j })
    .eq("id", list[i].id);
  await db
    .from("categories")
    .update({ sort_order: orderOf.get(list[i].id) ?? i })
    .eq("id", list[j].id);
  return listCategoriesFull(db);
}

/* ------------------------------------------------------------------ */
/* Zones                                                               */
/* ------------------------------------------------------------------ */

export async function listZonesFull(
  db: SupabaseClient,
): Promise<DeliveryZone[]> {
  const { data, error } = await db
    .from("delivery_zones")
    .select("*")
    .order("sort_order");
  if (error) throw new Error("zone list failed");
  return ((data ?? []) as DbZone[]).map(mapZone);
}

export async function upsertZone(
  db: SupabaseClient,
  raw: unknown,
): Promise<DeliveryZone> {
  const body = (raw ?? {}) as {
    id?: string;
    name?: string;
    areas?: string[];
    charge?: number;
    etaLabel?: string;
    active?: boolean;
    sort_order?: number;
  };
  const name = clean(body.name, 80);
  if (name.length < 2) throw new AdminInputError("Zone name is too short.");
  const areas = Array.isArray(body.areas)
    ? [...new Set(
        body.areas
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim().slice(0, 80))
          .filter((a) => a !== ""),
      )].slice(0, 30)
    : [];
  if (areas.length === 0) throw new AdminInputError("Add at least one area.");
  const charge = cleanInt(body.charge, -1);
  if (charge < 0) throw new AdminInputError("Charge must be 0 or more (paisa).");
  const etaLabel = clean(body.etaLabel, 40) || "45–50 min";
  const active = body.active !== false;

  let id = clean(body.id, 32);
  const { data: all } = await db.from("delivery_zones").select("id,sort_order,active");
  const rows = (all ?? []) as { id: string; sort_order: number; active: boolean }[];
  if (id === "") {
    const max = rows.reduce((m, z) => {
      const n = Number(z.id.replace(/^\D+/, ""));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    id = `z${max + 1}`;
  }
  const isNew = !rows.some((z) => z.id === id);
  if (!isNew && !active) {
    const othersActive = rows.some((z) => z.id !== id && z.active);
    if (!othersActive) {
      throw new AdminInputError("Keep at least one active checkout zone.");
    }
  }
  const sortOrder = isNew
    ? rows.reduce((m, z) => Math.max(m, z.sort_order), -1) + 1
    : (rows.find((z) => z.id === id)?.sort_order ?? 0);
  const { error } = await db.from("delivery_zones").upsert(
    { id, name, areas, charge, eta_label: etaLabel, active, sort_order: sortOrder },
    { onConflict: "id" },
  );
  if (error) throw new Error("zone save failed");
  const { data, error: readError } = await db
    .from("delivery_zones")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !data) throw new Error("zone read failed");
  return mapZone(data as DbZone);
}

export async function deleteZone(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const { data: all } = await db.from("delivery_zones").select("id");
  const rows = (all ?? []) as { id: string }[];
  if (rows.length <= 1) {
    throw new AdminInputError("Keep at least one checkout zone.");
  }
  const { error } = await db.from("delivery_zones").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new AdminInputError(
        "That zone has orders — hide it instead of deleting.",
        409,
      );
    }
    throw new Error("zone delete failed");
  }
}

export async function moveZoneRow(
  db: SupabaseClient,
  id: string,
  dir: -1 | 1,
): Promise<DeliveryZone[]> {
  const list = await listZonesFull(db);
  const i = list.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) {
    throw new AdminInputError("Cannot move that zone there.");
  }
  const { data: rows } = await db
    .from("delivery_zones")
    .select("id,sort_order")
    .in("id", [list[i].id, list[j].id]);
  const orderOf = new Map(
    ((rows ?? []) as { id: string; sort_order: number }[]).map((r) => [r.id, r.sort_order]),
  );
  await db
    .from("delivery_zones")
    .update({ sort_order: orderOf.get(list[j].id) ?? j })
    .eq("id", list[i].id);
  await db
    .from("delivery_zones")
    .update({ sort_order: orderOf.get(list[i].id) ?? i })
    .eq("id", list[j].id);
  return listZonesFull(db);
}

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

export async function listCouponsFull(
  db: SupabaseClient,
): Promise<Coupon[]> {
  const { data, error } = await db
    .from("coupons")
    .select("*")
    .order("code");
  if (error) throw new Error("coupon list failed");
  return ((data ?? []) as DbCoupon[]).map(mapCoupon);
}

const COUPON_CODE_RE = /^[A-Z0-9]{3,24}$/;

export async function upsertCoupon(
  db: SupabaseClient,
  raw: unknown,
): Promise<Coupon> {
  const body = (raw ?? {}) as {
    id?: string;
    code?: string;
    type?: string;
    value?: number;
    minOrder?: number;
    categoryId?: string | null;
    validFrom?: number | null;
    validUntil?: number | null;
    usageLimit?: number | null;
    active?: boolean;
  };
  const code = clean(body.code, 24).toUpperCase().replace(/\s+/g, "");
  if (!COUPON_CODE_RE.test(code)) {
    throw new AdminInputError("Code must be 3–24 letters/digits.");
  }
  const type = body.type === "percent" ? "percent" : body.type === "fixed" ? "fixed" : "";
  if (type === "") throw new AdminInputError("Coupon type must be percent or fixed.");
  const value = cleanInt(body.value, -1);
  if (type === "percent" && (value < 1 || value > 100)) {
    throw new AdminInputError("Percent must be between 1 and 100.");
  }
  if (type === "fixed" && value <= 0) {
    throw new AdminInputError("Fixed discount must be above 0 paisa.");
  }
  const minOrder = Math.max(0, cleanInt(body.minOrder));
  const categoryId = clean(body.categoryId ?? "", 64) || null;
  if (categoryId) {
    const { data: cat } = await db
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .single();
    if (!cat) throw new AdminInputError("That category does not exist.");
  }
  const toIso = (v: unknown): string | null => {
    if (v === null || v === undefined || v === "") return null;
    const ms = typeof v === "number" ? v : Date.parse(String(v));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  };
  const validFrom = toIso(body.validFrom);
  const validUntil = toIso(body.validUntil);
  if (validFrom && validUntil && validFrom > validUntil) {
    throw new AdminInputError("Validity must end after it starts.");
  }
  const usageLimit =
    body.usageLimit === null || body.usageLimit === undefined || body.usageLimit === 0
      ? null
      : Math.max(1, cleanInt(body.usageLimit, 1));

  const id = clean(body.id, 64);
  if (id !== "") {
    const { data: existing, error: readError } = await db
      .from("coupons")
      .select("*")
      .eq("id", id)
      .single();
    if (readError || !existing) throw new AdminInputError("Coupon not found.", 404);
    const { data: clash } = await db
      .from("coupons")
      .select("id")
      .eq("code", code)
      .neq("id", id)
      .limit(1);
    if (clash && clash.length > 0) {
      throw new AdminInputError("That code is already in use.", 409);
    }
    const { error } = await db
      .from("coupons")
      .update({
        code, type, value, min_order: minOrder, category_id: categoryId,
        valid_from: validFrom, valid_until: validUntil,
        usage_limit: usageLimit, active: body.active !== false,
      })
      .eq("id", id);
    if (error) throw new Error("coupon update failed");
  } else {
    const { data: clash } = await db
      .from("coupons")
      .select("id")
      .eq("code", code)
      .limit(1);
    if (clash && clash.length > 0) {
      throw new AdminInputError("That code is already in use.", 409);
    }
    const { error } = await db.from("coupons").insert({
      code, type, value, min_order: minOrder, category_id: categoryId,
      valid_from: validFrom, valid_until: validUntil,
      usage_limit: usageLimit, used: 0, active: body.active !== false,
    });
    if (error) {
      if (error.code === "23505") {
        throw new AdminInputError("That code is already in use.", 409);
      }
      throw new Error("coupon insert failed");
    }
  }
  const { data, error: readError } = await db
    .from("coupons")
    .select("*")
    .eq("code", code)
    .single();
  if (readError || !data) throw new Error("coupon read failed");
  return mapCoupon(data as DbCoupon);
}

export async function deleteCoupon(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new AdminInputError(
        "That coupon is on past orders — deactivate it instead.",
        409,
      );
    }
    throw new Error("coupon delete failed");
  }
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export interface AdminReview extends Review {
  productName: string;
  productSlug: string;
}

export async function listReviewsFull(
  db: SupabaseClient,
  status?: string,
): Promise<AdminReview[]> {
  let query = db
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  const s = clean(status, 16);
  if (s !== "") query = query.eq("status", s);
  const { data, error } = await query;
  if (error) throw new Error("review list failed");
  const rows = (data ?? []) as DbReview[];
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const names = new Map<string, { name: string; slug: string }>();
  if (productIds.length > 0) {
    const { data: products } = await db
      .from("products")
      .select("id,name,slug")
      .in("id", productIds);
    for (const p of ((products ?? []) as { id: string; name: string; slug: string }[])) {
      names.set(p.id, { name: p.name, slug: p.slug });
    }
  }
  return rows.map((r) => ({
    ...mapReview(r),
    productName: names.get(r.product_id)?.name ?? "Removed product",
    productSlug: names.get(r.product_id)?.slug ?? "",
  }));
}

const REVIEW_STATUSES = ["pending", "approved", "hidden", "flagged"] as const;

export async function moderateReviewRow(
  db: SupabaseClient,
  id: string,
  raw: unknown,
): Promise<AdminReview> {
  const body = (raw ?? {}) as { status?: string; featured?: boolean };
  const patch: { status?: string; featured?: boolean } = {};
  if (body.status !== undefined) {
    if (!(REVIEW_STATUSES as readonly string[]).includes(body.status)) {
      throw new AdminInputError("Unknown review status.");
    }
    patch.status = body.status;
  }
  if (body.featured !== undefined) patch.featured = body.featured === true;
  if (Object.keys(patch).length === 0) {
    throw new AdminInputError("Nothing to update.");
  }
  const { data, error } = await db
    .from("reviews")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new AdminInputError("Review not found.", 404);
  const row = data as DbReview;
  const { data: product } = await db
    .from("products")
    .select("name,slug")
    .eq("id", row.product_id)
    .single();
  const p = (product ?? {}) as { name?: string; slug?: string };
  return {
    ...mapReview(row),
    productName: p.name ?? "Removed product",
    productSlug: p.slug ?? "",
  };
}

export async function deleteReviewRow(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await db.from("reviews").delete().eq("id", id);
  if (error) throw new Error("review delete failed");
}

/* ------------------------------------------------------------------ */
/* Shops (marketplace phase 2, slice 2)                                */
/* ------------------------------------------------------------------ */

export interface AdminShop extends Shop {
  productCount: number;
}

export async function listShopsFull(
  db: SupabaseClient,
): Promise<AdminShop[]> {
  const { data, error } = await db
    .from("shops")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error("shop list failed");
  const shops = ((data ?? []) as DbShop[]).map(mapShop);
  const counts = new Map<string, number>();
  if (shops.length > 0) {
    const { data: rows } = await db
      .from("products")
      .select("shop_id")
      .in(
        "shop_id",
        shops.map((s) => s.id),
      );
    for (const r of ((rows ?? []) as { shop_id: string }[])) {
      counts.set(r.shop_id, (counts.get(r.shop_id) ?? 0) + 1);
    }
  }
  return shops.map((s) => ({ ...s, productCount: counts.get(s.id) ?? 0 }));
}

/**
 * Staff upsert: full-object save from the Shops queue (new manual rows send
 * no id; approval/suspend/commission edits send the row id). Vendors never
 * reach this — their PATCH is field-whitelisted in slice 3.
 */
export async function upsertShop(
  db: SupabaseClient,
  raw: unknown,
): Promise<Shop> {
  const body = (raw ?? {}) as {
    id?: string;
    slug?: string;
    name?: string;
    tagline?: string;
    logo_url?: string;
    logoUrl?: string;
    phone?: string;
    contact_email?: string;
    contactEmail?: string;
    address?: string;
    zone_ids?: string[];
    zoneIds?: string[];
    prep_minutes?: number;
    prepMinutes?: number;
    commission_pct?: number;
    commissionPct?: number;
    status?: string;
    is_open?: boolean;
    isOpen?: boolean;
  };
  const name = clean(body.name, 80);
  if (name.length < 2) throw new AdminInputError("Shop name is too short.");
  const phone = clean(body.phone, 20);
  const email = clean(body.contact_email ?? body.contactEmail, 120).toLowerCase();
  const zoneIds = Array.isArray(body.zone_ids ?? body.zoneIds)
    ? [...new Set(
        ((body.zone_ids ?? body.zoneIds) as unknown[])
          .filter((z): z is string => typeof z === "string")
          .map((z) => z.trim())
          .filter(Boolean),
      )].slice(0, 24)
    : [];
  const { data: zones } = await db.from("delivery_zones").select("id");
  const known = new Set(((zones ?? []) as { id: string }[]).map((z) => z.id));
  const badZone = zoneIds.find((z) => !known.has(z));
  if (badZone) throw new AdminInputError(`Unknown delivery zone: ${badZone}.`);
  const prep = Math.max(0, Math.min(240, cleanInt(body.prep_minutes ?? body.prepMinutes, 15)));
  const pctRaw = body.commission_pct ?? body.commissionPct;
  const commission = typeof pctRaw === "number" && Number.isFinite(pctRaw) ? pctRaw : 15;
  if (commission < 0 || commission > 90) {
    throw new AdminInputError("Commission must be between 0 and 90 percent.");
  }
  const status = body.status === "active" || body.status === "suspended" ? body.status : "pending";
  const isOpen = (body.is_open ?? body.isOpen) === true;

  const id = clean(body.id, 64);
  if (id !== "") {
    const patch = {
      name,
      tagline: clean(body.tagline, 200),
      logo_url: clean(body.logo_url ?? body.logoUrl, 500),
      phone,
      contact_email: email,
      address: clean(body.address, 300),
      zone_ids: zoneIds,
      prep_minutes: prep,
      commission_pct: commission,
      status,
      is_open: status === "active" ? isOpen : false,
    };
    const { data, error } = await db
      .from("shops")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new AdminInputError("Shop not found.", 404);
    return mapShop(data as DbShop);
  }

  const base =
    clean(body.slug, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) ||
    "shop";
  const { data, error } = await db
    .from("shops")
    .insert({
      slug: base,
      name,
      tagline: clean(body.tagline, 200),
      logo_url: clean(body.logo_url ?? body.logoUrl, 500),
      phone,
      contact_email: email,
      address: clean(body.address, 300),
      zone_ids: zoneIds,
      prep_minutes: prep,
      commission_pct: commission,
      status: "pending",
      is_open: false,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new AdminInputError("That shop slug is taken.", 409);
    }
    throw new Error("shop insert failed");
  }
  if (!data) throw new Error("shop insert failed");
  return mapShop(data as DbShop);
}
