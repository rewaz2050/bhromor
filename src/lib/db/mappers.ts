/**
 * Database → domain mappers. The UI already speaks `Product` / `Order` /
 * `DeliveryZone` / `Coupon` (src/lib/*); these pure functions translate
 * Supabase rows into exactly those shapes so no component needs rewriting
 * when reads move from demo seeds to the database.
 *
 * Kept free of server imports so unit tests can exercise them directly.
 */

import type {
  Category,
  DeliveryZone,
  Product,
  ProductMedia,
} from "../catalog";
import type { Coupon } from "../coupons";
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderTimelineEntry,
} from "../orders";
import type { Review, ReviewStatus } from "../review-store";
import type {
  DbCategory,
  DbCoupon,
  DbMedia,
  DbOrder,
  DbOrderHistory,
  DbOrderItem,
  DbOrderStatus,
  DbProduct,
  DbReview,
  DbVariant,
  DbZone,
} from "./types";

const epoch = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
};

const distinct = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

/** YouTube watch/share URLs → the 11-char video id (null when unparseable). */
export const youtubeIdFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url, "https://example.invalid");
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace(/^\//, "").split(/[?/]/)[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    const v = parsed.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const embed = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    return embed ? embed[1] : null;
  } catch {
    return null;
  }
};

export const mapCategory = (row: DbCategory): Category => ({
  id: row.id,
  name: row.name,
  nameBn: row.name_bn,
  tagline: row.tagline,
  image: row.image,
  subCategories: [...row.subcategories],
  active: row.active,
});

export const mapZone = (row: DbZone): DeliveryZone => ({
  id: row.id,
  name: row.name,
  areas: [...row.areas],
  charge: row.charge,
  etaLabel: row.eta_label,
  active: row.active,
});

export const mapCoupon = (row: DbCoupon): Coupon => ({
  id: row.id,
  code: row.code,
  type: row.type,
  value: row.value,
  minOrder: row.min_order,
  categoryId: row.category_id ?? undefined,
  validFrom: row.valid_from ? epoch(row.valid_from) : undefined,
  validUntil: row.valid_until ? epoch(row.valid_until) : undefined,
  usageLimit: row.usage_limit ?? undefined,
  used: row.used,
  active: row.active,
});

export interface ProductRowBundle {
  product: DbProduct;
  variants: DbVariant[];
  media: DbMedia[];
}

/**
 * Product row + its variants/media → storefront `Product`.
 * Colours/sizes/stock derive from active variants; ratings stay 0 until
 * genuine reviews exist (public pages never render seed ratings).
 */
export const mapProduct = (bundle: ProductRowBundle): Product => {
  const { product: p, variants, media } = bundle;
  const live = variants.filter((v) => v.active);
  const colors = distinct(live.map((v) => v.color));
  const sizes = distinct(live.map((v) => v.size));
  const stock = live.reduce((s, v) => s + Math.max(0, v.available), 0);
  const inStock = p.in_stock && (live.length === 0 || stock > 0);

  const ordered = [...media].sort((a, b) => a.sort_order - b.sort_order);
  const images: ProductMedia[] = ordered
    .filter((m) => m.type === "image")
    .map((m) => ({ src: m.url, alt: m.alt_text || p.name }));
  const yt = ordered.find((m) => m.type === "youtube");
  const youtubeId = yt ? youtubeIdFromUrl(yt.url) : null;

  const description = p.description
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    nameBn: p.name_bn || undefined,
    category: p.category_id,
    subCategory: p.subcategory,
    price: p.price,
    compareAtPrice: p.compare_at_price ?? undefined,
    shortDescription: p.short_description,
    description: description.length > 0 ? description : [p.short_description],
    details: p.details.map((d) => ({ ...d })),
    colors,
    sizes,
    featured: p.featured,
    isNew: p.is_new,
    inStock,
    lowStock: p.low_stock || (inStock && stock > 0 && stock <= 5),
    media: images,
    video: youtubeId
      ? { youtubeId, label: yt?.alt_text || p.name }
      : undefined,
    rating: 0,
    reviewCount: 0,
    badge:
      p.compare_at_price && p.compare_at_price > p.price
        ? "sale"
        : p.is_new
          ? "new"
          : p.featured
            ? "featured"
            : undefined,
    status: p.status,
    active: p.active,
    stock,
    seo:
      p.seo_title || p.seo_description
        ? {
            title: p.seo_title ?? undefined,
            description: p.seo_description ?? undefined,
          }
        : undefined,
  };
};

export interface OrderRowBundle {
  order: DbOrder;
  items: DbOrderItem[];
  history: DbOrderHistory[];
  zoneName: string;
  etaLabel: string;
  couponCode?: string;
  /** Product lookup for snapshot enrichment (slug + image). */
  products?: Map<string, { slug: string; image: string }>;
}

/** Order + items + history rows → the admin/track `Order` shape. */
export const mapOrder = (bundle: OrderRowBundle): Order => {
  const { order: o, items, history } = bundle;
  const createdAt = epoch(o.created_at);
  const orderedHistory = [...history].sort(
    (a, b) => epoch(a.created_at) - epoch(b.created_at),
  );
  const timeline: OrderTimelineEntry[] =
    orderedHistory.length > 0
      ? orderedHistory.map((h) => ({
          status: h.status as OrderStatus,
          at: epoch(h.created_at),
          note: h.note ?? undefined,
        }))
      : [{ status: "pending" as OrderStatus, at: createdAt }];

  const deliveredAt = orderedHistory.find(
    (h) => (h.status as DbOrderStatus) === "delivered",
  );
  const deliveredMinutes =
    o.status === "delivered" && deliveredAt
      ? Math.max(1, Math.round((epoch(deliveredAt.created_at) - createdAt) / 60000))
      : undefined;

  const domainItems: OrderItem[] = items.map((it) => {
    const extra = it.product_id
      ? bundle.products?.get(it.product_id)
      : undefined;
    return {
      productId: it.product_id ?? "",
      slug: extra?.slug ?? "",
      name: it.name,
      sku: it.sku,
      variant: it.variant,
      qty: it.qty,
      unitPrice: it.unit_price,
      image: extra?.image ?? "",
    };
  });

  return {
    id: o.order_no ?? o.id,
    createdAt,
    customer: {
      name: o.customer_name,
      phone: o.customer_phone,
      area: o.area,
      address: o.address || undefined,
      note: o.note || undefined,
    },
    zoneId: o.zone_id,
    zoneName: bundle.zoneName,
    etaLabel: bundle.etaLabel,
    items: domainItems,
    subtotal: o.subtotal,
    deliveryCharge: o.delivery_charge,
    total: o.total,
    payment: "cod",
    status: o.status as OrderStatus,
    timeline,
    deliveredMinutes,
    coupon:
      bundle.couponCode && o.discount > 0
        ? { code: bundle.couponCode, discount: o.discount }
        : undefined,
  };
};

/** Review row → the moderation-queue + storefront `Review` shape. */
export const mapReview = (row: DbReview): Review => ({
  id: row.id,
  productId: row.product_id,
  rating: Math.max(1, Math.min(5, row.rating)),
  author: row.author,
  title: row.title ?? undefined,
  body: row.body,
  date: epoch(row.created_at),
  status: row.status as ReviewStatus,
  verified: row.verified,
  featured: row.featured || undefined,
});
