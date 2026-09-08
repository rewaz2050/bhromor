import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight, IconBox, IconLeaf, IconShield, IconTruck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About",
  description:
    "PROSANTI (প্রশান্তি) — a premium commerce and rapid local delivery platform built on trust, simplicity and transparent fulfilment.",
};

export default function AboutPage() {
  return (
    <>
      {/* Intro */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <Eyebrow>About PROSANTI</Eyebrow>
        <div className="mt-6 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h1 className="font-display text-4xl font-medium leading-tight tracking-tight text-forest-900 sm:text-5xl">
              প্রশান্তি — the calm way to shop &amp; receive.
            </h1>
            <div className="mt-6 space-y-5 leading-8 text-ink-soft">
              <p>
                PROSANTI begins with a small, carefully chosen catalog of
                premium clothing — but it is designed as a commerce platform,
                not a clothing store. The same foundation will carry lifestyle
                products, home goods and entirely new categories as the brand
                grows.
              </p>
              <p>
                Our core promise is simple: discover premium products, order
                with confidence, and know where your order is until it reaches
                your door — with a{" "}
                <strong className="text-forest-800">
                  45–50 minute rapid delivery target
                </strong>{" "}
                inside our service area.
              </p>
            </div>
          </div>
          <div className="arch relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden bg-ivory-200 ring-1 ring-line lg:max-w-none">
            <Image
              src="/images/products/panjabi-detail.jpg"
              alt="Detail of premium green panjabi fabric with tonal embroidery"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: IconShield,
              title: "Trust first",
              text: "Real product information, transparent prices and delivery charges, a clear return policy, and a real support channel.",
            },
            {
              icon: IconTruck,
              title: "Fast, honest delivery",
              text: "Zone-based charges and arrival estimates — a 45–50 minute target where operations can genuinely hold it.",
            },
            {
              icon: IconBox,
              title: "Tracked to the door",
              text: "A calm order timeline: confirmation, preparing, courier assigned, out for delivery — no chasing, no guessing.",
            },
            {
              icon: IconLeaf,
              title: "Curated, not crowded",
              text: "A deliberately small catalog. Every piece is chosen for quality, so a short shelf never feels empty.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-3xl bg-paper p-7 ring-1 ring-line">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-800">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="font-display mt-5 text-xl font-medium text-forest-900">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ops + CTA */}
      <section className="border-y border-line bg-forest-900">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 text-ivory-100 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-medium leading-snug">
              Launching inside a service area we can reliably serve.
            </h2>
            <p className="mt-4 leading-7 text-ivory-100/70">
              We expand our delivery zones only when we can keep the promise —
              measured, not assumed. Growth is deliberate: build small, launch,
              measure, learn, improve, scale.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/shop" variant="gold">
                Explore the catalog <IconArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/delivery" variant="glass">
                See delivery zones
              </ButtonLink>
            </div>
          </div>
          <div className="arch relative aspect-[4/3] overflow-hidden bg-forest-800">
            <Image
              src="/images/products/gamcha.jpg"
              alt="Folded traditional gamcha towels with red and cream weave"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover opacity-90"
            />
          </div>
        </div>
      </section>
    </>
  );
}
