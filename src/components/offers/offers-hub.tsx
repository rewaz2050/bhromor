"use client";

/**
 * The offers hub (UX plan §10, R7) — one page for every real saving:
 *   • the owner's public promo code (CMS-switched, checkout-validated),
 *   • the flash drop while its window runs (own countdown),
 *   • every marked-down piece, biggest saving first, as a full grid,
 *   • the set of the week — the first in-stock piece that has complements.
 * With none of those it does not pretend: an honest empty state and the
 * new arrivals rail, so the page is never a dead end.
 */

import Link from "next/link";
import { useMemo } from "react";
import ListImpression from "@/components/analytics/list-impression";
import PromoCodeCard from "@/components/home/promo-code-card";
import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import ProductCard, { GRID_CARD_SIZES } from "@/components/product/product-card";
import BundleOffer from "@/components/promo/bundle-offer";
import FlashRail from "@/components/promo/flash-rail";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import type { Product } from "@/lib/catalog";
import { newArrivals, offerProducts } from "@/lib/home-shelves";
import { publicPromoCode } from "@/lib/home-cms";
import { completeTheLook, isDiscoverable } from "@/lib/merchandising";
import { useHomeSettings } from "@/lib/use-home-settings";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { usePromos } from "@/lib/use-promos";

/** The first in-stock, discoverable piece that really has complements in stock. */
export const bundleAnchor = (products: Product[]): Product | null =>
  products.find((p) => isDiscoverable(p) && p.inStock && completeTheLook(p, products, 1).length > 0) ?? null;

export default function OffersHub({ pool }: { pool: Product[] }) {
  const { t, lang } = useLanguage();
  const { products: live } = useLiveCatalog();
  const { settings } = useHomeSettings();
  const { promos, flash } = usePromos();
  // Server rows first (they are what the page was rendered with); the live
  // registry takes over once it answers so prices never go stale.
  const products = live.length > 0 ? live : pool;
  const offers = useMemo(() => offerProducts(products, 0), [products]);
  const anchor = useMemo(() => (promos.bundle.enabled ? bundleAnchor(products) : null), [promos.bundle.enabled, products]);
  const hasCode = !!publicPromoCode(settings);
  const hasFlash = promos.flash.enabled && flash.active;
  const empty = offers.length === 0 && !hasCode && !hasFlash && !anchor;
  const fresh = useMemo(() => newArrivals(products), [products]);
  const count = lang === "bn" ? bnDigits(String(offers.length)) : String(offers.length);

  return (
    <div data-testid="offers-hub">
      <header className="max-w-2xl">
        <Eyebrow>{t("offers.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.03em] text-forest-900">
          {t("offers.title")}
        </h1>
        <p className="mt-4 text-sm leading-7 text-ink-soft sm:text-base">{t("offers.sub")}</p>
      </header>

      <div className="mt-8 space-y-10">
        <PromoCodeCard />
        <FlashRail limit={8} />

        {offers.length > 0 ? (
          <section aria-labelledby="offers-grid-heading" data-testid="offers-grid" data-list="offers-grid">
            <ListImpression list="offers-grid" count={offers.length} />
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="offers-grid-heading" className="font-display text-2xl text-forest-900 sm:text-3xl">
                  {t("offers.gridTitle")}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{t("offers.gridCount").replace("{n}", count)}</p>
              </div>
              <Link href="/shop?filter=sale" className="editorial-text-link group shrink-0">
                {t("offers.saleListing")}
                <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
              {offers.map((p) => (
                <ProductCard key={p.id} product={p} sizes={GRID_CARD_SIZES} />
              ))}
            </div>
          </section>
        ) : null}

        {anchor ? (
          <section aria-labelledby="offers-set-heading" data-testid="offers-set">
            <h2 id="offers-set-heading" className="font-display text-2xl text-forest-900 sm:text-3xl">
              {t("offers.setTitle")}
            </h2>
            <div className="-mt-14">
              <BundleOffer product={anchor} />
            </div>
          </section>
        ) : null}

        {empty ? (
          <div
            data-testid="offers-empty"
            className="rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 py-16 text-center"
          >
            <h2 className="font-display text-2xl text-forest-900">{t("offers.emptyTitle")}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">{t("offers.emptySub")}</p>
            <Link
              href="/shop"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-forest-800 px-7 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
            >
              {t("offers.emptyCta")}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}

        {fresh.length >= 2 ? (
          <div className="-mx-4 sm:-mx-6 lg:-mx-8">
            <ProductRail
              id="offers-new-rail"
              testId="offers-new-rail"
              eyebrow={t("home.newEyebrow")}
              title={t("offers.newTitle")}
              sub={t("home.newSub")}
              href="/shop?sort=newest"
              seeAllLabel={t("offers.newSeeAll")}
              products={fresh}
              tone="paper"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
