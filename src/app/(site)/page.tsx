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
import { useCms } from "@/lib/use-cms";
import type { HomeSettings } from "@/lib/home-cms";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * The storefront deliberately follows one short editorial journey:
 * Hero → Collections → Featured edit → Service strip.
 * Visual Journal and Our Story have been removed per request — keeping the
 * homepage tight and commerce-focused.
 */

export default function Home() {
  const { settings } = useCms();
  const sections = settings.sections;

  return (
    <>
      {sections.hero && <Hero cms={settings} />}
      {sections.collections && <CollectionsSection />}
      {sections.featured && <BestSellersSection />}
      {sections.trust && <TrustStrip />}
    </>
  );
}

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

      <div className="relative mx-auto flex w-full max-w-7xl items-end px-5 pb-12 pt-28 sm:items-center sm:px-8 sm:py-20 lg:px-10 xl:px-8">
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
            className="mt-6 font-display text-[clamp(3rem,6.2vw,6.25rem)] font-normal leading-[0.98] tracking-[-0.045em]"
          >
            <span className="block">{displayHero.title1}</span>
            <span className="mt-1 block italic text-gold-200">{displayHero.title2}</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-ivory-100/82 sm:text-base sm:leading-8">
            {displayHero.subtitle}
          </p>
          <Link
            href="/shop"
            className="editorial-button mt-8 bg-ivory-100 text-forest-950 hover:bg-gold-200"
          >
            {displayHero.primaryLabel}
            <IconArrowRight className="h-4 w-4" />
          </Link>
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

function CollectionsSection() {
  const { t, lang } = useLanguage();
  const { products, categories, shops } = useLiveCatalog();
  const { zoneId } = useMyZone();
  const zoned = filterProductsForZone(
    products,
    shops,
    zoneId,
    shops[0]?.id ?? "",
  );
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

function BestSellersSection() {
  const { t } = useLanguage();
  const { products, shops } = useLiveCatalog();
  const { zoneId } = useMyZone();
  const featured = filterProductsForZone(
    products,
    shops,
    zoneId,
    shops[0]?.id ?? "",
  ).filter((p) => p.featured);
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
