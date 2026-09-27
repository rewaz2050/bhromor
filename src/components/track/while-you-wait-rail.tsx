"use client";

/**
 * "While you wait" (UX plan §7) — the tracker is the page a customer
 * reopens most while a parcel is on its way. Under the status, a short
 * rail of new in-stock pieces (never what is already in the order) turns
 * that waiting into browsing. Hidden below two candidates.
 */

import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";
import type { Order } from "@/lib/orders";
import { useLiveCatalog } from "@/lib/use-live-catalog";

export const TRACK_RAIL_MIN = 2;

/** New first, then featured, then the rest of the shelf — in stock only. */
export const whileYouWait = (order: Pick<Order, "items">, products: Product[], limit = 8): Product[] => {
  const ordered = new Set(order.items.map((it) => it.productId));
  const pool = products.filter((p) => p.inStock && !ordered.has(p.id));
  const rank = (p: Product) => (p.isNew ? 0 : p.featured ? 1 : 2);
  return [...pool].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
};

export default function WhileYouWaitRail({ order }: { order: Pick<Order, "items"> }) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  const items = whileYouWait(order, products);
  if (items.length < TRACK_RAIL_MIN) return null;
  return (
    <ProductRail
      id="track-rail"
      testId="track-rail"
      eyebrow={t("track.whileYouWaitEyebrow")}
      title={t("track.whileYouWaitTitle")}
      sub={t("track.whileYouWaitSub")}
      href="/shop?sort=newest"
      seeAllLabel={t("track.whileYouWaitSeeAll")}
      products={items}
      tone="paper"
    />
  );
}
