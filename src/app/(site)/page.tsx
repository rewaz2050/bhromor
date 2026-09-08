"use client";

import Link from "next/link";
import Image from "next/image";
import {
  CATEGORIES,
  FEATURED_PRODUCTS,
  NEW_ARRIVALS,
  productsByCategory,
} from "@/lib/catalog";
import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import {
  IconArrowRight,
  IconBox,
  IconLeaf,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";
import { useCms } from "@/lib/use-cms";
import type { HomeSettings } from "@/lib/home-cms";

export default function Home() {
  const { settings } = useCms();
  const s = settings.sections;
  return (
    <>
      {s.hero && <Hero cms={settings} />}
      {s.trust && <TrustStrip />}
      {s.collections && <CollectionsSection />}
      {s.featured && <FeaturedSection />}
      {s.brandStory && <BrandStorySection />}
      {s.newArrivals && <NewArrivalsSection />}
      {s.deliveryPromise && <DeliveryPromiseSection />}
    </>
  );
}

function Hero({ cms }: { cms: HomeSettings }) {
  const { hero } = cms;
  return (
    <section
      aria-labelledby="hero-heading"
      className="editorial-hero relative isolate overflow-hidden bg-forest-900 text-ivory-50"
    >
      <div className="mx-auto grid max-w-[1600px] lg:min-h-[650px] lg:grid-cols-[1fr_1.05fr]">
        <div className="relative z-10 flex flex-col justify-center px-6 pb-12 pt-14 sm:px-12 sm:py-16 lg:px-16 xl:px-24">
          <p className="flex items-center gap-3 text-[0.62rem] font-medium uppercase tracking-[0.26em] text-gold-200">
            <span
              aria-hidden="true"
              className="h-px w-8 shrink-0 bg-gold-400"
            />
            {hero.eyebrow}
          </p>
          <h1
            id="hero-heading"
            className="mt-7 font-display text-[clamp(3.3rem,6.1vw,6rem)] font-normal leading-[1.06] tracking-[-0.045em]"
          >
            {hero.title1}
            <br />
            <span className="font-normal italic text-gold-200">
              {hero.title2}
            </span>
          </h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-ivory-100/75 sm:text-base sm:leading-8">
            {hero.subtitle}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Link
              href="/shop"
              className="editorial-button bg-ivory-100 text-forest-950 hover:bg-gold-200"
            >
              {hero.primaryLabel}
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-11 items-center border-b border-ivory-100/40 text-xs font-medium tracking-wide transition-colors hover:text-gold-200"
            >
              {hero.secondaryLabel}
            </Link>
          </div>
          <div className="mt-12 flex items-center gap-4 border-t border-ivory-100/15 pt-5 lg:mt-16">
            <span className="font-bengali text-xl text-gold-200">
              প্রশান্তি
            </span>
            <span aria-hidden="true" className="h-6 w-px bg-white/20" />
            <p className="text-[0.6rem] uppercase leading-5 tracking-[0.2em] text-ivory-100/60">
              Rooted in tradition.
              <br />
              Considered for today.
            </p>
          </div>
        </div>
        <div className="relative min-h-[440px] bg-ivory-200 sm:min-h-[540px] lg:min-h-full">
          <Image
            src="/images/hero-editorial.webp"
            alt="Forest-green panjabi with gold embroidery, styled in a sunlit studio"
            fill
            preload
            sizes="(min-width: 1600px) 820px, (min-width: 1024px) 52vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-forest-950/55 via-transparent to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-5 border border-white/30 sm:inset-7"
          />
          <div className="absolute inset-x-10 bottom-10 flex items-end justify-between gap-4 text-white sm:inset-x-12 sm:bottom-12">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.26em] text-ivory-100/85">
                The signature edit
              </p>
              <p className="mt-2 font-display text-3xl italic">
                Quietly distinctive.
              </p>
            </div>
            <Link
              href="/shop?category=men"
              aria-label="Explore the men's collection"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/60 transition-colors hover:bg-ivory-100 hover:text-forest-900"
            >
              <IconArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const TRUST_ITEMS = [
  {
    icon: IconLeaf,
    title: "Considered quality",
    text: "A carefully selected collection",
  },
  {
    icon: IconTruck,
    title: "Rapid local delivery",
    text: "45–50 min target in service areas",
  },
  {
    icon: IconShield,
    title: "Cash on delivery",
    text: "Pay when your order arrives",
  },
  {
    icon: IconBox,
    title: "With you, every step",
    text: "Track from confirmation to doorstep",
  },
];

function TrustStrip() {
  return (
    <section
      aria-label="The PROSANTI service"
      className="border-b border-line bg-ivory-100/60"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 py-4 sm:px-6 lg:grid-cols-4 lg:px-8 lg:py-6">
        {TRUST_ITEMS.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex items-start gap-3 px-2 py-4 sm:px-4 lg:border-r lg:border-line lg:last:border-r-0"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <div>
              <h2 className="text-xs font-medium text-forest-900 sm:text-sm">
                {title}
              </h2>
              <p className="mt-1.5 text-[0.65rem] leading-5 text-ink-soft sm:text-xs">
                {text}
              </p>
            </div>
          </div>
        ))}
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
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5 sm:mb-12">
      <div className="max-w-xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-4xl font-normal leading-tight tracking-[-0.025em] text-forest-900 sm:text-5xl">
          {title}
        </h2>
        {sub && (
          <p className="mt-4 max-w-lg text-sm leading-7 text-ink-soft">{sub}</p>
        )}
      </div>
      {href && linkLabel && (
        <Link href={href} className="editorial-text-link group">
          {linkLabel}
          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

function CollectionsSection() {
  const visibleCategories = CATEGORIES.filter((c) => c.active !== false)
    .map((category) => ({
      category,
      count: productsByCategory(category.id).length,
    }))
    .filter(({ count }) => count > 0);
  if (!visibleCategories.length) return null;
  return (
    <section id="collections" className="scroll-mt-32">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="A wardrobe, thoughtfully composed"
          title="Find your everyday."
          href="/shop"
          linkLabel="Explore the collections"
        />
        <div className="grid gap-7 sm:grid-cols-3 sm:gap-5 lg:gap-7">
          {visibleCategories.map(({ category, count }, index) => (
            <Link
              key={category.id}
              href={`/shop?category=${category.id}`}
              className="group min-w-0"
            >
              <div className="relative aspect-[5/4] overflow-hidden bg-ivory-200 sm:aspect-[4/5]">
                <Image
                  src={category.image}
                  alt={`${category.name} collection`}
                  fill
                  sizes="(min-width: 1280px) 390px, (min-width: 640px) 33vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                />
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-4 text-[0.65rem] tracking-[0.2em] text-forest-900/70"
                >
                  0{index + 1} / THE COLLECTION
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-b border-line pb-5">
                <div>
                  <p className="font-bengali text-xs text-gold-600">
                    {category.nameBn}
                  </p>
                  <h3 className="mt-1 font-display text-3xl text-forest-900">
                    {category.name}
                  </h3>
                  <p className="mt-2 text-[0.65rem] uppercase tracking-[0.12em] text-ink-soft">
                    {category.subCategories.join(" · ")}
                  </p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-forest-800 transition-colors group-hover:border-forest-800 group-hover:bg-forest-800 group-hover:text-ivory-50">
                  <IconArrowRight className="h-4 w-4" />
                </span>
              </div>
              <span className="sr-only">
                Explore {count} {count === 1 ? "product" : "products"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedSection() {
  return (
    <section className="border-y border-line bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="The considered edit"
          title="Featured products"
          sub="Beautiful in the details. Effortless in the everyday. Discover the pieces that define our collection."
          href="/shop"
          linkLabel="Shop the edit"
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 xl:grid-cols-4">
          {FEATURED_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandStorySection() {
  return (
    <section id="story" className="scroll-mt-32 overflow-hidden bg-ivory-100">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-24">
        <div className="relative mx-auto w-full max-w-lg pb-8 pr-8 sm:pb-12 sm:pr-12">
          <div className="arch relative aspect-[4/5] overflow-hidden bg-ivory-200">
            <Image
              src="/images/products/three-piece-detail.jpg"
              alt="A close look at the gold zari border and woven texture of a green dupatta"
              fill
              sizes="(min-width: 1024px) 460px, 85vw"
              className="object-cover"
            />
          </div>
          <div className="absolute bottom-0 right-0 flex h-32 w-32 flex-col items-center justify-center rounded-full border-[6px] border-ivory-100 bg-forest-900 text-ivory-100 sm:h-40 sm:w-40">
            <IconLeaf className="mb-2 h-6 w-6 text-gold-300" />
            <span className="font-display text-2xl italic sm:text-3xl">
              Less, but
            </span>
            <span className="mt-1 text-[0.6rem] uppercase tracking-[0.25em] text-gold-200">
              better.
            </span>
          </div>
        </div>
        <div className="max-w-lg">
          <Eyebrow>The heart of PROSANTI</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-normal leading-[1.15] tracking-tight text-forest-900 sm:text-5xl">
            Some things deserve
            <br />
            <span className="italic text-gold-600">a little more thought.</span>
          </h2>
          <p className="mt-7 text-sm leading-8 text-ink-soft">
            The texture you reach for. The fit that feels like you. The quiet
            details you notice with time. We believe a good wardrobe begins with
            fewer, more considered choices.
          </p>
          <p className="mt-4 text-sm leading-8 text-ink-soft">
            That same care shapes how we serve you — honest product information,
            transparent pricing, and an order you can follow all the way to your
            door.
          </p>
          <div className="my-8 grid grid-cols-2 gap-6 border-y border-line py-6">
            <div>
              <p className="font-display text-xl text-forest-900">
                Thoughtfully selected
              </p>
              <p className="mt-2 text-xs leading-6 text-ink-soft">
                Quality over endless choice.
              </p>
            </div>
            <div>
              <p className="font-display text-xl text-forest-900">
                Honestly delivered
              </p>
              <p className="mt-2 text-xs leading-6 text-ink-soft">
                Clear charges. No surprises.
              </p>
            </div>
          </div>
          <Link href="/about" className="editorial-text-link">
            Discover our story
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function NewArrivalsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="A fresh perspective"
        title="New arrivals"
        sub="New additions. The same considered approach."
        href="/shop?filter=new"
        linkLabel="Discover what's new"
      />
      <div className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {NEW_ARRIVALS.map((product) => (
          <div
            key={product.id}
            className="w-[72%] min-w-[230px] snap-start sm:w-auto sm:min-w-0"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.6rem] uppercase tracking-[0.2em] text-ink-soft sm:hidden">
        Swipe to explore the new edit →
      </p>
    </section>
  );
}

function DeliveryPromiseSection() {
  return (
    <section className="border-y border-line bg-ivory-100">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-12 sm:px-8 lg:flex-row lg:items-center lg:gap-12 lg:py-16">
        <div className="flex items-start gap-5 sm:gap-7">
          <span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gold-300 text-gold-600 sm:flex">
            <IconTruck className="h-7 w-7" />
          </span>
          <div>
            <Eyebrow>Care, all the way to your door</Eyebrow>
            <h2 className="mt-3 font-display text-3xl text-forest-900 sm:text-4xl">
              A considered experience. Delivered.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">
              Follow every step of your order. Our rapid delivery target is
              45–50 minutes within supported service areas.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-5 lg:flex-col lg:items-start">
          <Link
            href="/track"
            className="editorial-button bg-forest-800 text-ivory-50 hover:bg-forest-700"
          >
            Track your order
            <IconArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/delivery" className="editorial-text-link">
            Delivery information
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
