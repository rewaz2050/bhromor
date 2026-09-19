"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Product } from "@/lib/catalog";
import {
  RECENTLY_VIEWED_RAIL,
  clearRecentlyViewed,
  getRecentlyViewed,
  getRecentlyViewedServer,
  pushRecentlyViewed,
  subscribeRecentlyViewed,
} from "@/lib/recently-viewed";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { Eyebrow } from "@/components/ui/primitives";
import ProductCard from "@/components/product/product-card";

/**
 * Records the piece being looked at. Mounted once per product page; it writes
 * after the first paint so a page view never waits on storage.
 */
export function RecentlyViewedTracker({
  product,
}: {
  product: Pick<Product, "id" | "slug">;
}) {
  useEffect(() => {
    pushRecentlyViewed({ id: product.id, slug: product.slug });
  }, [product.id, product.slug]);
  return null;
}

/**
 * "Recently viewed" rail — resolved against the LIVE catalog, so a piece the
 * shop unpublished or sold out simply isn't shown any more (a stale card with
 * an old price is worse than no card). Renders nothing below two pieces: a
 * shelf of one is just a repeat of where you already are.
 */
export default function RecentlyViewedRail({
  excludeId,
  className = "",
}: {
  /** The product being viewed right now — never repeated in its own rail. */
  excludeId?: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const views = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewed,
    getRecentlyViewedServer,
  );
  const { products } = useLiveCatalog();

  const items = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    const out: Product[] = [];
    for (const view of views) {
      const product = byId.get(view.id) ?? bySlug.get(view.slug);
      if (!product || product.id === excludeId) continue;
      if (out.some((p) => p.id === product.id)) continue;
      out.push(product);
      if (out.length >= RECENTLY_VIEWED_RAIL) break;
    }
    return out;
  }, [views, products, excludeId]);

  if (items.length < 2) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      data-testid="recently-viewed-rail"
      className={`border-t border-line bg-paper ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>{t("recently.eyebrow")}</Eyebrow>
            <h2
              id="recently-viewed-heading"
              className="mt-3 font-display text-[clamp(1.6rem,3vw,2.5rem)] font-normal leading-tight tracking-[-0.03em] text-forest-900"
            >
              {t("recently.title")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-7 text-ink-soft">
              {t("recently.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={clearRecentlyViewed}
            className="min-h-11 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft underline underline-offset-4 transition-colors hover:text-forest-900"
          >
            {t("recently.clear")}
          </button>
        </div>

        <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:gap-6 sm:px-0">
          {items.map((product) => (
            <div
              key={product.id}
              className="w-[62vw] min-w-[210px] shrink-0 snap-start sm:w-[250px]"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
