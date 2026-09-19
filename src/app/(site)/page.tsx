"use client";

import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/product/product-card";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useMyZone } from "@/lib/use-my-zone";
import { filterProductsForZone } from "@/lib/shop-utils";
import { useHomeSettings } from "@/lib/use-home-settings";
import type { HomeSettings } from "@/lib/home-cms";
import { useLanguage } from "@/components/i18n/language-provider";
import FlashRail from "@/components/promo/flash-rail";
import LiveBanner from "@/components/live/live-banner";
import HomeDeliveryCheck from "@/components/home/home-delivery-check";
import ProductRail from "@/components/home/product-rail";
import CategoryShelfBlock from "@/components/home/category-shelf";
import {
  bestSellers,
  categoryLabel,
  categoryShelves,
  newArrivals,
} from "@/lib/home-shelves";
import type { Category, Product, Shop } from "@/lib/catalog";

/**
 * Homepage (Batch J, 2026-09-19) — a shelf, not a poster.
 *
 * Hero (compact) → browse chips → delivery check → flash drop (when live)
 * → best sellers (real orders) → new arrivals → collections → featured edit
 * → EVERY category with its pieces → service strip.
 *
 * The shopper who lands here can see what we sell, in which category, at
 * what price, without leaving the page — and every heading is a link into
 * the filtered shop when they want the long list.
 */

export default function Home() {
  const { settings } = useHomeSettings();
  const sections = settings.sections;
  const { products, categories, shops } = useLiveCatalog();
  const { zoneId } = useMyZone();
  // One zone-scoped, orderable-shop-only pool for every section below.
  const pool = filterProductsForZone(products, shops, zoneId, shops[0]?.id ?? "");

  return (
    <>
      {/* P1 #9 — real live-shopping state only; renders nothing otherwise. */}
      <LiveBanner />
      {sections.hero && <Hero cms={settings} categories={categories} pool={pool} />}
      {/* P2 #20 — the first question is "do you come to my para, for how
          much?": four true-for-every-order facts + a one-field zone check,
          directly under the hero instead of three pages away. */}
      <HomeDeliveryCheck />
      {/* A running drop goes above the browsing, not under it — that is the
          one place a countdown actually changes what someone does next. */}
      <FlashRail limit={4} />
      <CuratedRails pool={pool} />
      {sections.collections && <CollectionsSection pool={pool} categories={categories} />}
      {sections.featured && <BestSellersSection pool={pool} />}
      <WholeShelf pool={pool} categories={categories} shops={shops} allProducts={products} />
      {sections.trust && <TrustStrip />}
    </>
  );
}

/**
 * "Browse" chips directly under the hero copy: every active category with
 * pieces, plus New arrivals / Best sellers. This is the first screen's
 * answer to "what do you sell?" — on a phone the hero used to fill the whole
 * viewport with a photo and one button.
 */
function BrowseChips({ categories, pool }: { categories: Category[]; pool: Product[] }) {
  const { t, lang } = useLanguage();
  const shelves = categoryShelves(pool, categories, 0);
  const hasBest = bestSellers(pool).length > 0;
  const chips: { key: string; label: string; href: string }[] = [
    ...shelves.map((s) => ({
      key: s.category.id,
      label: categoryLabel(s.category, lang),
      href: s.href,
    })),
    { key: "new", label: t("home.chipNew"), href: "/shop?sort=newest" },
    ...(hasBest ? [{ key: "best", label: t("home.chipBest"), href: "/shop?sort=best" }] : []),
    { key: "all", label: t("home.chipAll"), href: "/shop" },
  ];
  return (
    <nav aria-label={t("home.browseLabel")} data-testid="browse-chips" className="mt-7">
      <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((chip) => (
          <li key={chip.key} className="shrink-0 snap-start">
            <Link
              href={chip.href}
              lang={lang === "bn" ? "bn" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full border border-ivory-100/35 bg-ivory-50/10 px-4 text-xs font-semibold text-ivory-50 backdrop-blur-sm transition-colors hover:border-gold-200 hover:bg-ivory-50 hover:text-forest-950 ${lang === "bn" ? "font-bengali text-sm" : ""}`}
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Best sellers (real `unitsSold`) + new arrivals — the two curated paths. */
function CuratedRails({ pool }: { pool: Product[] }) {
  const { t } = useLanguage();
  const best = bestSellers(pool);
  const fresh = newArrivals(pool);
  return (
    <>
      <ProductRail
        id="best-sellers"
        testId="rail-best"
        eyebrow={t("home.bestEyebrow")}
        title={t("home.bestTitle")}
        sub={t("home.bestSub")}
        href="/shop?sort=best"
        seeAllLabel={t("home.bestAll")}
        products={best}
        tone="ivory"
      />
      <ProductRail
        id="new-arrivals"
        testId="rail-new"
        eyebrow={t("home.newEyebrow")}
        title={t("home.newTitle")}
        sub={t("home.newSub")}
        href="/shop?sort=newest"
        seeAllLabel={t("home.newAll")}
        products={fresh}
        tone="paper"
      />
    </>
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

function Hero({
  cms,
  categories,
  pool,
}: {
  cms: HomeSettings;
  categories: Category[];
  pool: Product[];
}) {
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
      className="cinematic-hero relative isolate flex overflow-hidden bg-forest-950 text-ivory-50"
    >
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/editorial/hero-prosanti.jpg"
          alt="A man wearing PROSANTI's forest-green panjabi in a sunlit Bangladeshi heritage interior"
          fill
          preload
          sizes="100vw"
          className="hero-cinematic-image object-cover will-change-transform"
          style={{ transform: "translateZ(0)" }}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,22,17,0.97)_0%,rgba(7,25,19,0.84)_28%,rgba(8,24,18,0.30)_58%,rgba(8,20,15,0.08)_100%)] max-sm:bg-[linear-gradient(0deg,rgba(5,18,13,0.94)_0%,rgba(5,18,13,0.55)_48%,rgba(5,18,13,0.10)_78%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-forest-950/35 via-transparent to-forest-950/10"
      />

      <div className="relative mx-auto flex w-full max-w-7xl items-end px-5 pb-8 pt-20 sm:items-center sm:px-8 sm:py-14 lg:px-10 xl:px-8">
        <div className="hero-copy max-w-2xl">
          <p className="flex items-center gap-3 text-[0.64rem] font-semibold uppercase tracking-[0.32em] text-gold-200">
            <span aria-hidden="true" className="h-px w-8 bg-gold-300/80" />
            {displayHero.eyebrow}
            <span aria-hidden="true" className="text-gold-300/60">/</span>
            <span lang="bn" className="font-bengali text-sm font-medium normal-case tracking-normal">
              {lang === "bn" ? "PROSANTI" : t("hero.prosanti")}
            </span>
          </p>
          <h1
            id="hero-heading"
            className="mt-4 font-display text-[clamp(2.4rem,5.2vw,5rem)] font-normal leading-[0.98] tracking-[-0.045em]"
          >
            <span className="block">{displayHero.title1}</span>
            <span className="mt-1 block italic text-gold-200">{displayHero.title2}</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-ivory-100/82 sm:text-base sm:leading-8">
            {displayHero.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/shop"
              className="editorial-button bg-ivory-100 text-forest-950 hover:bg-gold-200"
            >
              {displayHero.primaryLabel}
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#shelf"
              className="inline-flex min-h-[3.25rem] items-center gap-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ivory-100/85 transition-colors hover:text-gold-200"
            >
              {t("home.shelfEyebrow")}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          {/* Batch J — the first screen names what we sell. */}
          <BrowseChips categories={categories} pool={pool} />
        </div>
      </div>

      <p className="absolute bottom-7 right-8 hidden text-[0.58rem] font-medium uppercase tracking-[0.28em] text-ivory-100/70 lg:block">
        {t("hero.badge")}
      </p>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <Reveal className="mb-9 flex flex-wrap items-end justify-between gap-5 sm:mb-11">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-[clamp(2.35rem,4.4vw,4.25rem)] font-normal leading-[1.04] tracking-[-0.035em] text-forest-900">
          {title}
        </h2>
        {sub && (
          <p className="mt-4 max-w-xl text-sm leading-7 text-ink-soft sm:text-[0.95rem]">
            {sub}
          </p>
        )}
      </div>
      {href && linkLabel && (
        <Link href={href} className="editorial-text-link group">
          {linkLabel}
          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </Reveal>
  );
}

function CollectionsSection({
  pool,
  categories,
}: {
  pool: Product[];
  categories: Category[];
}) {
  const { t, lang } = useLanguage();
  const zoned = pool;
  const visibleCategories = categories.filter((category) => category.active !== false)
    .map((category) => ({
      category,
      count: zoned.filter((p) => p.category === category.id).length,
    }))
    .filter(({ count }) => count > 0);

  if (!visibleCategories.length) return null;

  return (
    <section id="collections" className="scroll-mt-28 bg-ivory-50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow={t("collections.eyebrow")}
          title={t("collections.title")}
          sub={t("collections.subtitle")}
          href="/shop"
          linkLabel={t("collections.viewAll")}
        />

        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:gap-7">
          {visibleCategories.map(({ category, count }, index) => (
            <Reveal
              key={category.id}
              delay={index * 90}
              className="collection-card w-[78vw] min-w-[245px] shrink-0 snap-start sm:w-auto sm:min-w-0"
            >
              <Link
                href={`/shop?category=${category.id}`}
                className="group block"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-ivory-200">
                  <Image
                    src={category.image}
                    alt={`${category.name} collection`}
                    fill
                    sizes="(min-width: 1280px) 390px, (min-width: 640px) 33vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-forest-950/20 via-transparent to-transparent"
                  />
                  <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-ivory-50/92 text-forest-900 backdrop-blur-sm transition-all duration-300 group-hover:bg-forest-900 group-hover:text-ivory-50 group-hover:scale-105">
                    <IconArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>

                <div className="mt-5 border-b border-line pb-5">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
                    {lang === "bn" ? category.nameBn : category.name}
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-4">
                    <h3
                      lang={lang === "bn" ? "bn" : undefined}
                      className={`font-display text-3xl font-normal tracking-[-0.025em] text-forest-900 ${lang === "bn" ? "font-bengali text-2xl" : ""}`}
                    >
                      {lang === "bn" ? category.nameBn : category.name}
                    </h3>
                    <span className="pb-1 text-[0.6rem] uppercase tracking-[0.16em] text-ink-soft">
                      {String(count).padStart(2, "0")} {t("collections.pieces")}
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function BestSellersSection({ pool }: { pool: Product[] }) {
  const { t } = useLanguage();
  const featured = pool.filter((p) => p.featured);
  if (featured.length === 0) return null;
  return (
    <section id="featured" className="border-y border-line bg-paper scroll-mt-28">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow={t("bestSellers.eyebrow")}
          title={t("bestSellers.title")}
          sub={t("bestSellers.subtitle")}
          href="/shop"
          linkLabel={t("bestSellers.shopCollection")}
        />
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 lg:gap-x-7">
          {featured.slice(0, 4).map((product, index) => (
            <Reveal
              key={product.id}
              delay={index * 80}
              className="w-[72vw] min-w-[230px] shrink-0 snap-start sm:w-auto sm:min-w-0"
            >
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
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
