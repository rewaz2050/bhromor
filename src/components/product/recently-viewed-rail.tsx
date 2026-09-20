"use client";

import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useRecentlyViewed, useRecordView } from "@/lib/use-recently-viewed";

/**
 * "Recently viewed" on a product page: the pieces this device looked at
 * before this one (never the current piece), newest first. Also the place
 * where the view itself is remembered — one component, one responsibility
 * pair, so a page can never record without offering the way back.
 * Sits ABOVE the same-category shelf, which stays the last thing on the page.
 */
export default function RecentlyViewedRail({
  currentId,
  limit = 4,
}: {
  currentId: string;
  limit?: number;
}) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  useRecordView(currentId);
  const items = useRecentlyViewed(products, { exclude: currentId, limit });
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="recently-viewed-heading"
      data-testid="recently-viewed"
      className="mt-16 border-t border-line pt-12"
    >
      <Eyebrow>{t("home.recentEyebrow")}</Eyebrow>
      <h2
        id="recently-viewed-heading"
        className="font-display mt-3 text-3xl font-medium tracking-tight text-forest-900"
      >
        {t("home.recentTitle")}
      </h2>
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
