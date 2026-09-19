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
import FlashRail from "@/components/promo/flash-rail";
import LiveBanner from "@/components/live/live-banner";
import HomeDeliveryCheck from "@/components/home/home-delivery-check";
import CategoryShelfBlock from "@/components/home/category-shelf";
import RecentlyViewedRail from "@/components/product/recently-viewed-rail";
import { categoryShelves } from "@/lib/home-shelves";
import type { Category, Product, Shop } from "@/lib/catalog";

/**
 * Homepage (Batch K, 2026-09-19) — a small door, then the whole shop.
 *
 * Compact hero (one slim banner, not a full screen) → categories → offers
 * (the running flash drop) → EVERY category with its pieces → para check
 * → service strip. The shopper who lands here sees what we sell, in which
 * category, at what price, within the first scroll — and every heading is
 * a link into the filtered shop when they want the long list.
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
      {sections.hero && <Hero cms={settings} />}
      {/* Categories first: the landing question is "what do you sell?" */}
      {sections.collections && <CollectionsSection pool={pool} categories={categories} />}
      {/* Offers — whatever drop is running right now; renders nothing between
          windows, so the categories flow straight into the shelf. */}
      <FlashRail limit={4} />
      {/* The whole shop: one block per category, every discoverable piece. */}
      <WholeShelf pool={pool} categories={categories} shops={shops} allProducts={products} />
      {/* Batch L — this device's own trail, resolved against the live
          catalog; renders nothing for a first-time visitor. */}
      <RecentlyViewedRail className="mt-14 border-t-0" />
      {/* P2 #20 — "do you come to my para, for how much?" closes the page:
          trust pills + a one-field zone check that quotes the real charge. */}
      <HomeDeliveryCheck />
      {sections.trust && <TrustStrip />}
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

/**
 * Compact hero (Batch K): the full-screen cinematic poster is gone. One slim
 * banner — eyebrow, headline, one line of copy, one CTA into the shop, and a
 * quiet "shop by category" jump to the section right below. The CMS copy and
 * the §31 visibility toggle still drive it.
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
      className="compact-hero relative isolate flex overflow-hidden bg-forest-950 text-ivory-50"
    >
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/editorial/hero-prosanti.jpg"
          alt="A man wearing PROSANTI's forest-green panjabi in a sunlit Bangladeshi heritage interior"
          fill
          preload
          sizes="100vw"
          className="hero-compact-image object-cover will-change-transform"
          style={{ transform: "translateZ(0)" }}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,22,17,0.96)_0%,rgba(7,25,19,0.84)_34%,rgba(8,24,18,0.32)_64%,rgba(8,20,15,0.08)_100%)] max-sm:bg-[linear-gradient(0deg,rgba(5,18,13,0.93)_0%,rgba(5,18,13,0.55)_55%,rgba(5,18,13,0.16)_100%)]"
      />

      <div className="relative mx-auto flex w-full max-w-7xl items-center px-5 py-9 sm:px-8 sm:py-12 lg:px-8">
        <div className="hero-copy max-w-2xl">
          <p className="flex items-center gap-2.5 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-gold-200">
            <span aria-hidden="true" className="h-px w-6 bg-gold-300/80" />
            {displayHero.eyebrow}
            <span aria-hidden="true" className="text-gold-300/60">/</span>
            <span lang="bn" className="font-bengali text-xs font-medium normal-case tracking-normal">
              {lang === "bn" ? "PROSANTI" : t("hero.prosanti")}
            </span>
          </p>
          <h1
            id="hero-heading"
            className="mt-3 font-display text-[clamp(1.75rem,3.8vw,3.25rem)] font-normal leading-[1.06] tracking-[-0.035em]"
          >
            {displayHero.title1}{" "}
            <span className="italic text-gold-200">{displayHero.title2}</span>
          </h1>
          <p className="mt-2.5 max-w-md text-sm leading-7 text-ivory-100/82">
            {displayHero.subtitle}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/shop"
              className="editorial-button bg-ivory-100 text-forest-950 hover:bg-gold-200"
            >
              {displayHero.primaryLabel}
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#collections"
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ivory-100/85 transition-colors hover:text-gold-200"
            >
              {t("hero.categoriesCta")}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </div>
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

/**
 * Categories, directly under the hero: one card per active category with
 * pieces, each card a link into the filtered shop. This is the first
 * screen's answer to "what do you sell?" — before offers, before products.
 */
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
