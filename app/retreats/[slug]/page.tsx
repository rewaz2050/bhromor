import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import { retreats } from '@/lib/content';

const bdt = (n: number) => `৳ ${n.toLocaleString('en-US')}`;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return retreats.map((retreat) => ({ slug: retreat.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const retreat = retreats.find((r) => r.slug === slug);
  if (!retreat) return {};

  return {
    title: retreat.name,
    description: retreat.summary,
    openGraph: {
      title: `${retreat.name} — PROSANTI`,
      description: retreat.summary,
      images: [{ url: retreat.image, width: 1200, height: 900 }],
    },
  };
}

export default async function RetreatDetail({ params }: Props) {
  const { slug } = await params;
  const retreat = retreats.find((r) => r.slug === slug);
  if (!retreat) notFound();

  const others = retreats.filter((r) => r.slug !== retreat.slug).slice(0, 3);

  return (
    <>
      <section className="relative flex min-h-[80svh] items-end overflow-hidden bg-moss-950">
        <div className="absolute inset-0">
          <Image
            src={retreat.image}
            alt={retreat.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-moss-950/70 via-moss-950/30 to-moss-950/90" />
        </div>

        <div className="relative mx-auto w-full max-w-8xl px-6 pb-20 pt-44 text-ivory-pale sm:px-10 sm:pb-24">
          <Reveal>
            <Link
              href="/retreats"
              className="group inline-flex items-center gap-3 font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-ivory-deep/70 transition-colors hover:text-ivory-pale"
            >
              <Icon
                name="arrow"
                className="h-4 w-4 rotate-180 transition-transform duration-500 ease-calm group-hover:-translate-x-1.5"
              />
              All retreats
            </Link>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="display-xl mt-10 max-w-4xl font-light">
              {retreat.name}
            </h1>
            <p className="mt-4 font-bengali text-xl text-brass-200">
              {retreat.bn}
            </p>
            <p className="lede mt-8 max-w-xl !text-ivory-deep/85 font-italic">
              {retreat.tagline}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Fact strip */}
      <section className="border-b border-ink/10 bg-ivory-pale">
        <div className="mx-auto grid max-w-8xl grid-cols-2 gap-y-8 px-6 py-10 sm:px-10 lg:grid-cols-5">
          {[
            { k: 'Duration', v: retreat.nights },
            { k: 'Group', v: retreat.groupSize },
            { k: 'Season', v: retreat.season },
            { k: 'Runs', v: retreat.cadence },
            { k: 'From', v: `${bdt(retreat.priceBdt)} pp` },
          ].map((item) => (
            <div key={item.k}>
              <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                {item.k}
              </p>
              <p className="mt-2 font-sans text-sm font-light text-ink-soft">
                {item.v}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Body */}
      <section className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-32">
        <div className="grid gap-16 lg:grid-cols-[1fr_0.62fr] lg:gap-24">
          <div className="space-y-7">
            <Reveal>
              <p className="eyebrow">About this stay</p>
            </Reveal>
            {retreat.body.map((para, i) => (
              <Reveal key={i} delay={i * 80}>
                <p className="body-copy text-[1.0625rem]">{para}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <aside className="lg:sticky lg:top-32 lg:self-start">
              <div className="rounded-sm border border-ink/10 bg-ivory-pale p-8">
                <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                  Included
                </p>
                <ul className="mt-6 space-y-4">
                  {retreat.includes.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 font-sans text-sm font-light leading-relaxed text-ink-soft"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 border-t border-ink/10 pt-8">
                  <p className="font-display text-[2rem] font-light text-ink">
                    {bdt(retreat.priceBdt)}
                  </p>
                  <p className="mt-1 font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40">
                    per person · approx ${retreat.priceUsd}
                  </p>
                </div>

                <Link href="/contact" className="btn-primary mt-8 w-full justify-center">
                  Check dates
                </Link>
                <p className="mt-4 text-center font-sans text-xs font-light text-ink/45">
                  No deposit until dates are confirmed.
                </p>
              </div>
            </aside>
          </Reveal>
        </div>
      </section>

      {/* Others */}
      <section className="border-t border-ink/10 bg-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-28">
          <Reveal>
            <p className="eyebrow">Also on offer</p>
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {others.map((other, i) => (
              <Reveal key={other.slug} delay={i * 100}>
                <Link href={`/retreats/${other.slug}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-sm">
                    <Image
                      src={other.image}
                      alt={other.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 30vw"
                      className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.06]"
                    />
                  </div>
                  <h3 className="display-md mt-6 font-light transition-colors duration-500 group-hover:text-moss-600">
                    {other.name}
                  </h3>
                  <p className="mt-2 font-sans text-sm font-light text-ink-soft">
                    {other.nights} · {bdt(other.priceBdt)} pp
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
