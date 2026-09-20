"use client";

import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useMyZone } from "@/lib/use-my-zone";
import { filterProductsForZone } from "@/lib/shop-utils";
import { useHomeSettings } from "@/lib/use-home-settings";
import type { HomeSettings } from "@/lib/home-cms";
import { useLanguage } from "@/components/i18n/language-provider";
import LiveBanner from "@/components/live/live-banner";
import HomeDeliveryCheck from "@/components/home/home-delivery-check";
import CategoryRow from "@/components/home/category-row";
import OffersBlock from "@/components/home/offers-block";
import CategoryShelfBlock from "@/components/home/category-shelf";
import CustomerStories from "@/components/reviews/customer-stories";
import { categoryShelves } from "@/lib/home-shelves";
import type { Category, Product, Shop } from "@/lib/catalog";

/**
 * Homepage (2026-09-20) — a shelf, top to bottom.
 *
 * Compact hero (one headline, one button — no full-screen poster)
 * → category row (every category with pieces, one tap to its shop)
 * → offers (flash drop when running + every marked-down piece)
 * → EVERY category with its pieces
 * → customer stories (approved reviews, hidden when none)
 * → delivery check → service strip.
 *
 * The shopper who lands here sees what we sell, in which category, at what
 * price, without leaving the page — and every heading is a link into the
 * filtered shop when they want the long list.
 */

export default function Home() {
  const { settings } = useHomeSettings();
  const sections = settings.sections;
  const { products, categories, shops, loading } = useLiveCatalog();
  const { zoneId } = useMyZone();
  // One zone-scoped, orderable-shop-only pool for every section below.
  const pool = filterProductsForZone(products, shops, zoneId, shops[0]?.id ?? "");
  // The hero is short now, so the catalog probe's few hundred ms would show
  // the service strip and footer alone — hold the shape of the page instead.
  const booting = loading && products.length === 0;

  return (
    <>
      {/* P1 #9 — real live-shopping state only; renders nothing otherwise. */}
      <LiveBanner />
      {sections.hero && <Hero cms={settings} />}
      {booting ? (
        <HomeSkeleton />
      ) : (
        <>
          {sections.collections && <CategoryRow pool={pool} categories={categories} />}
          {sections.offers && <OffersBlock pool={pool} />}
          <WholeShelf pool={pool} categories={categories} shops={shops} allProducts={products} />
          {/* Real approved reviews only — the block disappears when there
              are none rather than showing an empty "be the first" card. */}
          {sections.stories && <CustomerStories hideWhenEmpty />}
        </>
      )}
      {/* P2 #20 — "do you come to my para, for how much?": four
          true-for-every-order facts + a one-field zone check. */}
      <HomeDeliveryCheck />
      {sections.trust && <TrustStrip />}
    </>
  );
}

/**
 * The compact hero: a short band with the CMS headline, one sentence and the
 * single CTA — plus a small portrait on wider screens. It is deliberately
 * not a screen-filling photo: the category row must be visible on the first
 * screen of a phone.
 */
function Hero({ cms }: { cms: HomeSettings }) {
  const { hero } = cms;
  const { lang, t } = useLanguage();

  // When Bengali is selected, use curated translations for hero; otherwise use CMS (English)
  const displayHero =
    lang === "bn"
      ? {
          eyebrow: t("hero.eyebrow"),
          title1: t("hero.title1"),
          title2: t("hero.title2"),
          subtitle: t("hero.subtitle"),
          primaryLabel: t("hero.cta"),
        }
      : hero;

  return (
    <section
      aria-labelledby="hero-heading"
      data-testid="home-hero"
      className="compact-hero relative isolate overflow-hidden bg-forest-950 text-ivory-50"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-7 sm:px-6 sm:py-9 lg:gap-10 lg:px-8">
        <div className="hero-copy min-w-0 flex-1">
          <p className="flex items-center gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-gold-200">
            <span aria-hidden="true" className="h-px w-6 bg-gold-300/80" />
            {displayHero.eyebrow}
            <span aria-hidden="true" className="text-gold-300/60">/</span>
            <span lang="bn" className="font-bengali text-sm font-medium normal-case tracking-normal">
              {lang === "bn" ? "PROSANTI" : t("hero.prosanti")}
            </span>
          </p>
          <h1
            id="hero-heading"
            className="mt-3 font-display text-[clamp(1.75rem,3.6vw,2.75rem)] font-normal leading-[1.06] tracking-[-0.035em]"
          >
            {displayHero.title1}{" "}
            <span className="italic text-gold-200">{displayHero.title2}</span>
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-ivory-100/80">
            {displayHero.subtitle}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/shop"
              className="editorial-button bg-ivory-100 text-forest-950 hover:bg-gold-200"
            >
              {displayHero.primaryLabel}
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#shelf"
              className="inline-flex min-h-11 items-center gap-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ivory-100/85 transition-colors hover:text-gold-200"
            >
              {t("home.heroShelf")}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="relative hidden aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-md ring-1 ring-ivory-50/15 sm:block lg:w-44">
          <Image
            src="/images/editorial/hero-prosanti.jpg"
            alt="A man wearing PROSANTI's forest-green panjabi in a sunlit Bangladeshi heritage interior"
            fill
            loading="eager"
            sizes="(min-width: 1024px) 176px, 144px"
            className="object-cover object-[72%_center]"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The whole shelf: one block per category, every discoverable piece (capped
 * per block with a scoped "See all N in <category>" button). Empty catalog
 * → an honest note instead of a blank page.
 */
function WholeShelf({
  pool,
  categories,
  shops,
  allProducts,
}: {
  pool: Product[];
  categories: Category[];
  shops: Shop[];
  allProducts: Product[];
}) {
  const { t } = useLanguage();
  const { loading } = useLiveCatalog();
  const { zoneId, setZoneId } = useMyZone();
  const shelves = categoryShelves(pool, categories);
  if (shelves.length === 0) {
    if (loading || shops.length === 0) return null;
    // Pieces exist but none reach the saved zone → say so, offer the reset;
    // the "being stocked" note is only for a genuinely empty catalog.
    const zoneScoped = zoneId !== null && categoryShelves(allProducts, categories, 1).length > 0;
    return (
      <section
        aria-label={t("home.shelfTitle")}
        data-testid="whole-shelf-empty"
        className="border-y border-line bg-paper"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl text-forest-900">
            {zoneScoped ? t("shopBrowser.noShopsZone") : t("home.emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {zoneScoped ? t("shopBrowser.noShopsZoneHint") : t("home.emptyBody")}
          </p>
          {zoneScoped && (
            <button
              type="button"
              onClick={() => setZoneId(null)}
              className="editorial-button mt-6 bg-forest-900 text-ivory-50 hover:bg-forest-800"
            >
              {t("shopBrowser.showAllZones")}
            </button>
          )}
        </div>
      </section>
    );
  }
  return (
    <div id="shelf" className="scroll-mt-24" data-testid="whole-shelf">
      <div className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <Reveal>
          <Eyebrow>{t("home.shelfEyebrow")}</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(2.1rem,4vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.035em] text-forest-900">
            {t("home.shelfTitle")}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">{t("home.shelfSub")}</p>
        </Reveal>
      </div>
      {shelves.map((shelf, index) => (
        <CategoryShelfBlock key={shelf.category.id} shelf={shelf} index={index} />
      ))}
    </div>
  );
}

/** Placeholder for the category row + first shelf while the catalog loads. */
function HomeSkeleton() {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      aria-label={t("home.loading")}
      data-testid="home-skeleton"
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <span className="sr-only">{t("home.loading")}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-3 w-32 bg-ivory-200" />
        <div className="mt-3 h-8 w-64 max-w-full bg-ivory-200" />
        <div className="mt-6 flex gap-3 overflow-hidden sm:gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-[44vw] min-w-[150px] max-w-[220px] shrink-0 sm:w-[200px] lg:w-[224px]">
              <div className="aspect-[5/4] bg-ivory-200" />
              <div className="mt-3 h-4 w-2/3 bg-ivory-200" />
            </div>
          ))}
        </div>
        <div className="mt-14 h-3 w-24 bg-ivory-200" />
        <div className="mt-3 h-10 w-80 max-w-full bg-ivory-200" />
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] bg-ivory-200" />
              <div className="mt-4 h-3 w-1/3 bg-ivory-200" />
              <div className="mt-3 h-5 w-4/5 bg-ivory-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TRUST_ITEMS_KEYS = [
  { key: "trust.cashOnDelivery" as const, href: "/faq" },
  { key: "trust.instantDelivery" as const, href: "/delivery" },
  { key: "trust.easyReturns" as const, href: "/returns" },
  { key: "trust.orderTracking" as const, href: "/track" },
] as const;

function TrustStrip() {
  const { t } = useLanguage();
  return (
    <section aria-label="PROSANTI service promises" className="bg-forest-950 text-ivory-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 px-4 py-4 sm:flex-nowrap sm:gap-x-7 sm:px-6 lg:gap-x-10 lg:px-8">
        {TRUST_ITEMS_KEYS.map((item, index) => (
          <div key={item.key} className="flex items-center gap-x-5 sm:gap-x-7 lg:gap-x-10">
            {index > 0 && (
              <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-gold-400 sm:block" />
            )}
            <Link
              href={item.href}
              className="flex min-h-11 items-center whitespace-nowrap text-[0.63rem] font-semibold uppercase tracking-[0.16em] text-ivory-100/78 transition-colors hover:text-gold-200"
            >
              {t(item.key)}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
