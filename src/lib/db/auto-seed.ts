/**
 * Self-heal for an unseeded live catalog (docs/go-live.md).
 *
 * The storefront shows the launch seeds while `products` in the database is
 * empty, so browsing "works" — but a live checkout with an empty catalog was
 * a dead end ("Online ordering is not set up yet — please call …"). Instead of
 * blocking the customer, the orders route calls `ensureLaunchCatalog()` once
 * and the order lands as a real database order.
 *
 * It mirrors scripts/seed-supabase.mjs exactly (same rows, same natural keys,
 * same upsert semantics) but derives the data from `src/lib/catalog.ts` so the
 * two can never drift apart. Everything upserts on its natural key, so this
 * is safe to call repeatedly; it also only ever runs when the catalog is empty.
 *
 * Any DB rejection (missing table, RLS, outage) returns false — the caller
 * then answers with an honest 503 instead of a dead-end order.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "../catalog";

/** Launch coupon mirror of scripts/seed-supabase.mjs (same codes/values). */
const now = Date.now();
const DAY = 86_400_000;
const COUPONS = [
  {
    code: "WELCOME100",
    type: "fixed" as const,
    value: 10_000,
    min_order: 100_000,
    category_id: null,
    valid_from: null,
    valid_until: new Date(now + 90 * DAY).toISOString(),
    usage_limit: 500,
    used: 0,
  },
  {
    code: "PROSANTI15",
    type: "percent" as const,
    value: 15,
    min_order: 200_000,
    category_id: null,
    valid_from: null,
    valid_until: new Date(now + 30 * DAY).toISOString(),
    usage_limit: 200,
    used: 0,
  },
  {
    code: "EID50",
    type: "fixed" as const,
    value: 5_000,
    min_order: 0,
    category_id: "men",
    valid_from: null,
    valid_until: new Date(now + 7 * DAY).toISOString(),
    usage_limit: null,
    used: 0,
  },
];

/** Seeds mirror the launch stock flags (script: low stock 3, otherwise 12). */
const variantStock = (lowStock: boolean): number => (lowStock ? 3 : 12);

/**
 * Upsert the launch catalog into a database whose products table is EMPTY.
 * Returns true when every step succeeded; false on the first DB rejection.
 * "Empty" is TOTAL-row based: a catalog that exists but is all draft was
 * left that way on purpose by the admin — the slug-conflict upsert would
 * republish those rows. Non-empty table → hands off, no writes at all.
 */
export async function ensureLaunchCatalog(
  db: SupabaseClient,
): Promise<boolean> {
  // Guard: never mutate an existing catalog.
  const total = await db
    .from("products")
    .select("id", { count: "exact", head: true });
  if (total.error) return false;
  if ((total.count ?? 0) > 0) return false;

  // 0. shop #1 — the owner's own catalog (everything seeded below belongs
  //    to it). Same row as the script; vendors onboard later via admin.
  {
    const { error } = await db.from("shops").upsert(
      {
        slug: "prosanti-direct",
        name: "PROSANTI Direct",
        phone: "",
        zone_ids: DELIVERY_ZONES.map((z) => z.id),
        prep_minutes: 15,
        commission_pct: 15,
        status: "active",
        is_open: true,
      },
      { onConflict: "slug" },
    );
    if (error) return false;
  }
  const shopRes = await db
    .from("shops")
    .select("id")
    .eq("slug", "prosanti-direct")
    .maybeSingle();
  const shopId = (shopRes.data as { id?: string } | null)?.id;
  if (shopRes.error || !shopId) return false;

  // 1. lookup tables
  {
    const rows = CATEGORIES.map((c, i) => ({
      id: c.id,
      name: c.name,
      name_bn: c.nameBn ?? "",
      tagline: c.tagline,
      image: c.image,
      subcategories: c.subCategories,
      sort_order: i,
    }));
    const { error } = await db.from("categories").upsert(rows, { onConflict: "id" });
    if (error) return false;
  }
  {
    const rows = DELIVERY_ZONES.map((z, i) => ({
      id: z.id,
      name: z.name,
      areas: z.areas,
      charge: z.charge,
      eta_label: z.etaLabel,
      sort_order: i,
      active: true,
    }));
    const { error } = await db
      .from("delivery_zones")
      .upsert(rows, { onConflict: "id" });
    if (error) return false;
  }
  {
    const { error } = await db.from("coupons").upsert(COUPONS, { onConflict: "code" });
    if (error) return false;
  }
  {
    const { error } = await db.from("site_settings").upsert(
      [
        { key: "low_stock_threshold", value: 5 },
        { key: "free_delivery_threshold_paisa", value: 100_000 },
      ],
      { onConflict: "key" },
    );
    if (error) return false;
  }

  // 2. products (+ ids for the child rows, read back by slug)
  {
    const rows = PRODUCTS.map((p) => ({
      slug: p.slug,
      shop_id: shopId,
      name: p.name,
      name_bn: p.nameBn ?? "",
      sku: p.sku,
      category_id: p.category,
      subcategory: p.subCategory,
      short_description: p.shortDescription,
      description: p.description.join("\n\n"),
      details: p.details,
      price: p.price,
      compare_at_price: p.compareAtPrice ?? null,
      featured: p.featured,
      is_new: p.isNew,
      in_stock: true,
      low_stock: p.lowStock ?? false,
      status: "published" as const,
      active: true,
    }));
    const { error } = await db.from("products").upsert(rows, { onConflict: "slug" });
    if (error) return false;
  }
  const idsRes = await db
    .from("products")
    .select("id,slug")
    .in("slug", PRODUCTS.map((p) => p.slug));
  if (idsRes.error || !Array.isArray(idsRes.data) || idsRes.data.length === 0) {
    return false;
  }
  const idOf = new Map<string, string>(
    (idsRes.data as { id: string; slug: string }[]).map((r) => [r.slug, r.id]),
  );

  // 3. variants (color × size grid; stock mirrors the launch flags)
  {
    const rows: Record<string, unknown>[] = [];
    for (const p of PRODUCTS) {
      const productId = idOf.get(p.slug);
      if (!productId) continue;
      let n = 0;
      for (const color of p.colors) {
        for (const size of p.sizes) {
          n += 1;
          rows.push({
            product_id: productId,
            color,
            size,
            sku: `${p.sku}-V${n}`,
            price: p.price,
            stock: variantStock(!!p.lowStock),
            reserved: 0,
            active: true,
          });
        }
      }
    }
    if (rows.length > 0) {
      const { error } = await db
        .from("product_variants")
        .upsert(rows, { onConflict: "product_id,color,size" });
      if (error) return false;
    }
  }

  // 4. media (no natural key → rebuild per product so retries stay clean)
  {
    const productIds = [...idOf.values()];
    const del = await db.from("product_media").delete().in("product_id", productIds);
    if (del.error) return false;
    const rows: Record<string, unknown>[] = [];
    for (const p of PRODUCTS) {
      const productId = idOf.get(p.slug);
      if (!productId) continue;
      p.media.forEach((m, i) => {
        rows.push({
          product_id: productId,
          type: "image",
          url: m.src,
          public_id: null,
          alt_text: m.alt,
          sort_order: i,
          metadata: {},
        });
      });
    }
    if (rows.length > 0) {
      const { error } = await db.from("product_media").insert(rows);
      if (error) return false;
    }
  }

  return true;
}

/**
 * One-time bridge for carts built against the launch seed ids (ids `p1…pN`)
 * ordering against live rows (uuid ids). Resolves each unknown id through
 * slug — the same bridge `storefront_saved_items` uses — and only rewrites
 * lines that would otherwise validate as "unknown product".
 * Returns the (possibly new) items array; never mutates the input.
 */
export function remapSeedItemIds<T extends { productId?: unknown }>(
  items: T[],
  liveProducts: { id: string; slug: string }[],
): T[] {
  const bySlug = new Map(liveProducts.map((p) => [p.slug, p.id]));
  const seedIdToSlug = new Map(PRODUCTS.map((p) => [p.id, p.slug]));
  const liveIds = new Set(liveProducts.map((p) => p.id));
  let touched = false;
  const next = items.map((item) => {
    const id = typeof item?.productId === "string" ? item.productId : "";
    if (id === "" || liveIds.has(id)) return item;
    const slug = seedIdToSlug.get(id);
    const liveId = slug ? bySlug.get(slug) : undefined;
    if (!liveId) return item;
    touched = true;
    return { ...item, productId: liveId };
  });
  return touched ? next : items;
}
