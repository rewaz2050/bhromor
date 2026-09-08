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
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";
import {
  IconArrowRight,
  IconBox,
  IconCheck,
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
      {s.featured && <FeaturedSection />}
      {s.collections && <CollectionsSection />}
      {s.newArrivals && <NewArrivalsSection />}
      {s.brandStory && <BrandStorySection />}
      {s.deliveryPromise && <DeliveryPromiseSection />}
    </>
  );
}

/* ------------------------------- Hero ---------------------------------- */

function Hero({ cms }: { cms: HomeSettings }) {
  const hero = cms.hero;
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-forest-100/70 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="relative z-10">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="font-display mt-6 text-5xl font-medium leading-[1.06] tracking-tight text-forest-900 sm:text-6xl lg:text-[4.6rem]">
            {hero.title1}
            <br />
            {hero.title2}
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-ink-soft">
            <span className="font-bengali text-forest-800">প্রশান্তি</span> —{" "}
            {hero.subtitle.replace(/^প্রশান্তি —\s*/, "")}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <ButtonLink href="/shop" size="lg" variant="dark">
              {hero.primaryLabel} <IconArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/about" size="lg" variant="light">
              {hero.secondaryLabel}
            </ButtonLink>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-ink-soft">
            {[
              { icon: IconTruck, label: "45–50 min rapid delivery" },
              { icon: IconShield, label: "Cash on delivery" },
              { icon: IconLeaf, label: "Curated, quality-first" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-forest-600" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="arch relative aspect-[4/5] overflow-hidden bg-ivory-200 shadow-[0_40px_80px_-40px_rgba(12,25,19,0.55)] ring-1 ring-forest-900/10">
            <Image
              src="/images/hero.jpg"
              alt="PROSANTI — premium panjabi in deep forest green, editorial studio light"
              fill
              priority
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-950/30 via-transparent to-transparent" />
          </div>
          <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-2xl bg-paper px-5 py-4 shadow-xl ring-1 ring-line sm:flex">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-100 text-forest-800">
              <IconBox className="h-5 w-5" />
            </span>
            <div className="text-sm leading-tight">
              <p className="font-semibold text-ink">Order to doorstep</p>
              <p className="text-ink-soft">Confirmed · Tracked · Delivered</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Trust strip ----------------------------- */

const TRUST_ITEMS = [
  {
    icon: IconTruck,
    title: "45–50 minute delivery",
    text: "Rapid fulfilment inside our service area — zones expand over time.",
  },
  {
    icon: IconShield,
    title: "Cash on delivery",
    text: "Pay when your order arrives. Simple and risk-free.",
  },
  {
    icon: IconBox,
    title: "Track every step",
    text: "Order placed → confirmed → preparing → out for delivery.",
  },
  {
    icon: IconLeaf,
    title: "Considered quality",
    text: "A small, curated catalog — never a cluttered marketplace.",
  },
];

function TrustStrip() {
  return (
    <section className="border-y border-forest-900/10 bg-forest-900">
      <div className="mx-auto grid max-w-7xl gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {TRUST_ITEMS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-4 px-2 py-8 text-ivory-100">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-gold-300">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[0.95rem] font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-ivory-100/65">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- Sections -------------------------------- */

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
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-display mt-3 text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl">
          {title}
        </h2>
        {sub && <p className="mt-3 leading-7 text-ink-soft">{sub}</p>}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="group inline-flex items-center gap-2 text-sm font-semibold text-forest-700 transition-colors hover:text-forest-900"
        >
          {linkLabel}
          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

function FeaturedSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="The edit"
        title="Featured products"
        sub="A small, deliberate selection — the pieces we are proud to put first."
        href="/shop"
        linkLabel="View all"
      />
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 xl:grid-cols-4">
        {FEATURED_PRODUCTS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

function CollectionsSection() {
  return (
    <section
      id="collections"
      className="border-y border-line bg-ivory-100/70"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Collections"
          title="Shop by category"
          sub="Men · Women · Traditional — only categories that hold products appear here."
        />
        <div className="grid gap-6 sm:grid-cols-3">
          {CATEGORIES.map((category) => {
            const count = productsByCategory(category.id).length;
            return (
              <Link
                key={category.id}
                href={`/shop?category=${category.id}`}
                className="group relative overflow-hidden rounded-3xl bg-forest-900"
              >
                <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[3/4]">
                  <Image
                    src={category.image}
                    alt={`${category.name} collection`}
                    fill
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="object-cover opacity-90 transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-950/85 via-forest-950/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6 text-ivory-100">
                    <p className="font-bengali text-sm text-gold-300">
                      {category.nameBn}
                    </p>
                    <h3 className="font-display mt-1 text-2xl font-medium">
                      {category.name}
                    </h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ivory-100/70">
                      {category.subCategories.join(" · ")}
                    </p>
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-200">
                      Explore {count} {count === 1 ? "product" : "products"}
                      <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NewArrivalsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="Just in"
        title="New arrivals"
        sub="Fresh to the shelf this season — small runs, carefully finished."
        href="/shop?filter=new"
        linkLabel="See all new arrivals"
      />
      <div className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:[scrollbar-width:auto] lg:grid-cols-5">
        {NEW_ARRIVALS.map((product) => (
          <div
            key={product.id}
            className="w-[72%] min-w-[240px] snap-start sm:w-auto sm:min-w-0"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}

function BrandStorySection() {
  return (
    <section id="story" className="border-y border-line bg-paper">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-28">
        <div className="relative order-2 mx-auto w-full max-w-md lg:order-1 lg:max-w-none">
          <div className="arch relative aspect-[4/5] overflow-hidden bg-ivory-200 ring-1 ring-line">
            <Image
              src="/images/products/three-piece-detail.jpg"
              alt="Hand-finished dupatta with fine gold zari border"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -right-4 bottom-10 hidden rounded-2xl bg-forest-900 px-6 py-5 text-ivory-100 shadow-xl sm:block">
            <p className="font-display text-3xl font-medium text-gold-300">
              45–50
            </p>
            <p className="mt-1 text-sm text-ivory-100/70">
              min — our rapid
              <br />
              delivery service target
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <Eyebrow>Why PROSANTI</Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl">
            Built on trust, not
            <br />
            just transactions.
          </h2>
          <p className="mt-5 leading-8 text-ink-soft">
            In a market where trust is everything, we start from honesty: real
            product information, transparent pricing and delivery charges, a
            clear return policy, and an order you can watch move — from
            confirmation to your doorstep.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "A considered catalog — quality over infinite choice",
              "Transparent delivery zones, charges and arrival estimates",
              "Order timeline you can follow without an account",
              "Cash on delivery during the launch window",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[0.95rem] text-ink">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-800">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <ButtonLink href="/about" variant="dark" size="lg">
              More about us <IconArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeliveryPromiseSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-forest-950 px-6 py-16 text-center text-ivory-100 sm:px-16 sm:py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-forest-500/20 blur-3xl" />
        <p className="relative text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-300">
          The PROSANTI promise
        </p>
        <h2 className="font-display relative mx-auto mt-4 max-w-2xl text-3xl font-medium leading-tight sm:text-5xl">
          Know where your order is — until it reaches your door.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-[0.95rem] leading-7 text-ivory-100/70">
          Confirmation, preparation, courier assignment, out for delivery. A
          calm, honest timeline — no chasing, no guessing. The 45–50 minute
          window is our operational service target inside the launch area.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href="/track" size="lg" variant="gold">
            Track your order
          </ButtonLink>
          <ButtonLink href="/delivery" size="lg" variant="glass">
            Delivery information
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
