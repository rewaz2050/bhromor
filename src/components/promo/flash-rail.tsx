"use client";

/**
 * The drop rail (P0 #3) — what is discounted right now, with the deadline in
 * the header so the shelf itself carries the countdown.
 *
 * Renders nothing unless a window is running and at least two pieces are in it:
 * a one-product "sale" reads like a bug, and an empty rail is noise.
 */

import Link from "next/link";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { usePromos } from "@/lib/use-promos";
import { flashProducts, isFlashProduct } from "@/lib/promos";
import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import { FlashTimer } from "./flash-timer";

export default function FlashRail({
  excludeId,
  limit = 8,
}: {
  /** Hide the product the shopper is already looking at. */
  excludeId?: string;
  limit?: number;
} = {}) {
  const { promos, cfg, flash } = usePromos();
  const { products } = useLiveCatalog();
  const { t } = useLanguage();

  if (!promos.flash.enabled || !flash.active) return null;
  const picks = products
    .filter((p) => p.id !== excludeId && isFlashProduct(cfg, p))
    .slice(0, limit);
  if (picks.length < 2) return null;

  return (
    <section
      aria-labelledby="flash-rail-heading"
      data-testid="flash-rail"
      className="border-y border-line bg-ivory-100/60 px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>{promos.flash.title}</Eyebrow>
            <h2
              id="flash-rail-heading"
              className="mt-2 font-display text-3xl text-forest-900 sm:text-4xl"
            >
              {t("promo.dropPicks")} ·{" "}
              <span className="text-gold-700">
                {t("promo.pctOff").replace("{pct}", String(promos.flash.discountPct))}
              </span>
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {t("promo.itemsInDrop").replace(
                "{n}",
                String(flashProducts(products, cfg).length),
              )}
              {flash.endsAtMs ? (
                <>
                  {" · "}
                  <FlashTimer endsAtMs={flash.endsAtMs} className="font-semibold text-gold-700" />
                </>
              ) : null}
            </p>
          </div>
          <Link href="/shop" className="editorial-text-link inline-flex items-center gap-1.5">
            {t("promo.seeDrop")} <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {picks.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
