import Image from 'next/image';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import Marquee from '@/components/Marquee';
import Icon from '@/components/Icon';
import {
  hero,
  philosophy,
  experiences,
  retreats,
  testimonials,
  posts,
  site,
} from '@/lib/content';

const bdt = (n: number) => `৳ ${n.toLocaleString('en-US')}`;

export default function Home() {
  return (
    <>
      {/* ────────────── Hero ────────────── */}
      <section className="grain relative flex min-h-[100svh] items-end overflow-hidden bg-moss-950">
        <div className="absolute inset-0">
          <Image
            src="/images/hero-valley.jpg"
            alt="Mist rising off the tea terraces at Kamalpur at dawn"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-moss-950/70 via-moss-950/25 to-moss-950/90" />
        </div>

        <div className="relative mx-auto w-full max-w-8xl px-6 pb-20 pt-40 text-ivory-pale sm:px-10 sm:pb-28">
          <Reveal>
            <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-200">
              {hero.eyebrow}
            </p>
          </Reveal>

          <Reveal delay={120}>
            <h1 className="display-xl mt-8 max-w-5xl font-light">
              {hero.headline}
              <br />
              <span className="italic text-brass-200">{hero.headlineAccent}</span>
            </h1>
          </Reveal>

          <Reveal delay={240}>
            <p className="mt-10 max-w-xl font-sans text-[clamp(1rem,1.5vw,1.1875rem)] font-light leading-[1.75] text-ivory-deep/85">
              {hero.body}
            </p>
          </Reveal>

          <Reveal delay={360}>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href={hero.primaryCta.href} className="btn-primary !bg-ivory-pale !text-moss-950 hover:!bg-brass-200">
                {hero.primaryCta.label}
              </Link>
              <Link
                href={hero.secondaryCta.href}
                className="group inline-flex items-center gap-3 border-b border-ivory-pale/30 pb-2 font-sans text-[0.8125rem] font-medium uppercase tracking-[0.18em] transition-colors hover:border-ivory-pale"
              >
                {hero.secondaryCta.label}
                <Icon
                  name="arrow"
                  className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1.5"
                />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={480}>
            <dl className="mt-20 grid grid-cols-2 gap-y-10 border-t border-ivory-pale/15 pt-10 sm:grid-cols-4">
              {hero.stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="font-display text-[2.5rem] font-light leading-none text-ivory-pale">
                    {stat.value}
                  </dt>
                  <dd className="mt-2 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ivory-deep/60">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <Marquee />

      {/* ────────────── Philosophy ────────────── */}
      <section className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-40">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.05fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Reveal>
              <p className="eyebrow">{philosophy.label}</p>
              <h2 className="display-lg mt-8 font-light">{philosophy.title}</h2>
              <p className="lede mt-8 max-w-md font-italic">{philosophy.lede}</p>
            </Reveal>

            <Reveal delay={150}>
              <figure className="relative mt-14 aspect-[4/5] overflow-hidden rounded-sm">
                <Image
                  src="/images/pavilion.jpg"
                  alt="Open-air timber pavilion with linen curtains above the valley"
                  fill
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover"
                />
              </figure>
            </Reveal>
          </div>

          <div className="flex flex-col justify-center gap-16 sm:gap-20">
            {philosophy.pillars.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 120}>
                <div className="group flex gap-8">
                  <div className="w-20 shrink-0">
                    <span className="font-bengali text-[0.9375rem] text-moss-500">
                      {pillar.bn}
                    </span>
                    <div className="mt-4 h-px w-full bg-ink/10 transition-colors duration-700 group-hover:bg-moss-500" />
                    <span className="mt-3 block font-sans text-xs text-ink/35">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div>
                    <h3 className="display-md font-light">{pillar.title}</h3>
                    <p className="body-copy mt-5 max-w-lg">{pillar.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── Experiences ────────────── */}
      <section className="bg-moss-900 text-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
          <Reveal>
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow !text-brass-300 [&::before]:!bg-brass-400">
                  What the day offers
                </p>
                <h2 className="display-lg mt-8 max-w-2xl font-light text-ivory-pale">
                  Nothing is compulsory. Everything is available.
                </h2>
              </div>
              <p className="max-w-xs font-sans text-sm font-light leading-relaxed text-ivory-deep/60">
                Six things happen here on any given day. Most guests do two of
                them and spend the rest of the time doing nothing at all.
              </p>
            </div>
          </Reveal>

          <div className="mt-20 grid gap-px overflow-hidden rounded-sm bg-ivory/10 sm:grid-cols-2 lg:grid-cols-3">
            {experiences.map((exp, i) => (
              <Reveal key={exp.title} delay={(i % 3) * 100}>
                <article className="group h-full bg-moss-900 p-10 transition-colors duration-700 ease-calm hover:bg-moss-800">
                  <div className="flex items-start justify-between">
                    <Icon
                      name={exp.icon}
                      className="h-9 w-9 text-brass-300 transition-transform duration-700 ease-calm group-hover:-translate-y-1"
                    />
                    <span className="font-sans text-[0.625rem] font-medium uppercase tracking-[0.18em] text-ivory-deep/40">
                      {exp.meta}
                    </span>
                  </div>
                  <h3 className="display-md mt-10 font-light text-ivory-pale">
                    {exp.title}
                  </h3>
                  <p className="mt-1 font-bengali text-sm text-brass-300/80">
                    {exp.bn}
                  </p>
                  <p className="mt-6 font-sans text-sm font-light leading-[1.8] text-ivory-deep/65">
                    {exp.body}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── Retreats ────────────── */}
      <section className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-40">
        <Reveal>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Stays &amp; retreats</p>
              <h2 className="display-lg mt-8 max-w-2xl font-light">
                Four ways to disappear for a while.
              </h2>
            </div>
            <Link
              href="/retreats"
              className="group inline-flex w-fit items-center gap-3 font-sans text-[0.75rem] font-medium uppercase tracking-[0.18em] text-moss-700"
            >
              <span className="link-underline">See all details</span>
              <Icon
                name="arrow"
                className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1.5"
              />
            </Link>
          </div>
        </Reveal>

        <div className="mt-20 grid gap-x-8 gap-y-16 md:grid-cols-2">
          {retreats.map((retreat, i) => (
            <Reveal key={retreat.slug} delay={(i % 2) * 120}>
              <Link href={`/retreats/${retreat.slug}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-ivory-deep">
                  <Image
                    src={retreat.image}
                    alt={retreat.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 45vw"
                    className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.06]"
                  />
                  <span className="absolute left-5 top-5 rounded-full bg-ivory-pale/90 px-4 py-1.5 font-sans text-[0.625rem] font-medium uppercase tracking-[0.18em] text-moss-800 backdrop-blur">
                    {retreat.nights}
                  </span>
                </div>

                <div className="mt-7 flex items-start justify-between gap-6">
                  <div>
                    <h3 className="display-md font-light transition-colors duration-500 group-hover:text-moss-600">
                      {retreat.name}
                    </h3>
                    <p className="mt-1 font-bengali text-sm text-moss-500">
                      {retreat.bn}
                    </p>
                    <p className="mt-4 max-w-sm font-sans text-sm font-light leading-relaxed text-ink-soft">
                      {retreat.tagline}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-[1.375rem] font-light text-ink">
                      {bdt(retreat.priceBdt)}
                    </p>
                    <p className="mt-1 font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40">
                      per person
                    </p>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ────────────── Spring bath feature ────────────── */}
      <section className="relative overflow-hidden bg-ivory-deep">
        <div className="mx-auto grid max-w-8xl items-center gap-16 px-6 py-28 sm:px-10 sm:py-36 lg:grid-cols-2">
          <Reveal>
            <figure className="relative aspect-[5/6] overflow-hidden rounded-sm sm:aspect-[4/5]">
              <Image
                src="/images/spring-bath.jpg"
                alt="Stone soaking tub fed by a hillside spring, open to the valley"
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
            </figure>
          </Reveal>

          <div>
            <Reveal>
              <p className="eyebrow">The spring bath</p>
              <h2 className="display-lg mt-8 font-light">
                Water that comes down the hill, warmed by wood.
              </h2>
              <p className="lede mt-8">
                The tub is cut from local stone and fed by a spring forty metres
                above the house. It is heated by fire, filled by hand, and
                reserved to one guest at a time — never shared, never scheduled
                in five-minute blocks.
              </p>
            </Reveal>

            <Reveal delay={150}>
              <dl className="mt-12 grid grid-cols-2 gap-8 border-t border-ink/10 pt-10">
                {[
                  { k: 'Source', v: 'Natural hillside spring' },
                  { k: 'Heated by', v: 'Wood fire, by hand' },
                  { k: 'Reserved', v: 'One guest at a time' },
                  { k: 'Open', v: 'Dawn until dark' },
                ].map((item) => (
                  <div key={item.k}>
                    <dt className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                      {item.k}
                    </dt>
                    <dd className="mt-2 font-sans text-sm font-light text-ink-soft">
                      {item.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ────────────── Testimonials ────────────── */}
      <section className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
        <Reveal>
          <p className="eyebrow">Guests</p>
        </Reveal>
        <div className="mt-16 grid gap-12 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 120}>
              <figure className="flex h-full flex-col">
                <blockquote className="font-display text-[clamp(1.125rem,1.9vw,1.5rem)] font-light leading-[1.5] text-ink">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-8 border-t border-ink/10 pt-5">
                  <p className="font-sans text-sm font-medium text-ink">{t.name}</p>
                  <p className="mt-1 font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40">
                    {t.role}
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ────────────── Journal preview ────────────── */}
      <section className="border-t border-ink/10 bg-ivory-pale">
        <div className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
          <Reveal>
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow">From the journal</p>
                <h2 className="display-lg mt-8 max-w-xl font-light">
                  Notes from the garden.
                </h2>
              </div>
              <Link
                href="/journal"
                className="group inline-flex w-fit items-center gap-3 font-sans text-[0.75rem] font-medium uppercase tracking-[0.18em] text-moss-700"
              >
                <span className="link-underline">All entries</span>
                <Icon
                  name="arrow"
                  className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1.5"
                />
              </Link>
            </div>
          </Reveal>

          <div className="mt-16 divide-y divide-ink/10 border-y border-ink/10">
            {posts.map((post, i) => (
              <Reveal key={post.slug} delay={i * 90}>
                <Link
                  href={`/journal/${post.slug}`}
                  className="group grid items-center gap-6 py-10 md:grid-cols-[auto_1fr_auto] md:gap-10"
                >
                  <span className="font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40 md:w-36">
                    {post.dateLabel}
                  </span>
                  <div>
                    <h3 className="display-md font-light transition-colors duration-500 group-hover:text-moss-600">
                      {post.title}
                    </h3>
                    <p className="mt-3 max-w-2xl font-sans text-sm font-light leading-relaxed text-ink-soft">
                      {post.excerpt}
                    </p>
                    <p className="mt-3 font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40">
                      {post.category} · {post.minutes} min · {post.author}
                    </p>
                  </div>
                  <Icon
                    name="arrow"
                    className="hidden h-5 w-5 text-moss-600 transition-transform duration-500 ease-calm group-hover:translate-x-2 md:block"
                  />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── Location strip ────────────── */}
      <section className="bg-ivory">
        <div className="mx-auto max-w-8xl px-6 py-20 sm:px-10">
          <Reveal>
            <div className="grid gap-10 md:grid-cols-[auto_1fr] md:items-center">
              <p className="font-bengali text-2xl text-moss-600">{site.bnName}</p>
              <p className="font-sans text-[clamp(1.0625rem,1.8vw,1.375rem)] font-light leading-[1.7] text-ink-soft">
                {site.location} — fifty-five minutes from Sylhet Osmani
                International, at the foot of the Khasi hills, on a working tea
                estate that has been picking here since 1954.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
