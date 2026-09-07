import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import { retreats } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Retreats',
  description:
    'Four stays at PROSANTI, from a long weekend to a seven-day silent retreat. Nine rooms, all meals included, no screens.',
};

const bdt = (n: number) => `৳ ${n.toLocaleString('en-US')}`;

export default function RetreatsPage() {
  return (
    <>
      <section className="mx-auto max-w-8xl px-6 pb-20 pt-44 sm:px-10 sm:pt-52">
        <Reveal>
          <p className="eyebrow">Stays &amp; retreats</p>
          <h1 className="display-xl mt-8 max-w-4xl font-light">
            Four ways to
            <br />
            <span className="italic text-moss-600">disappear.</span>
          </h1>
          <p className="lede mt-10 max-w-2xl">
            Every stay includes all meals, the grounds, the reading room, and
            the spring bath. Nothing here is a programme you have to attend.
            Prices are per person and single occupancy costs nothing extra
            outside December.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <dl className="mt-16 grid grid-cols-2 gap-y-8 border-y border-ink/10 py-8 sm:grid-cols-4">
            {[
              { k: 'Rooms', v: 'Nine, always' },
              { k: 'Max guests', v: 'Nine plus two' },
              { k: 'Meals', v: 'Three a day, included' },
              { k: 'Transfer', v: 'From ZYL, included' },
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
      </section>

      <section className="mx-auto max-w-8xl px-6 pb-28 sm:px-10 sm:pb-36">
        <div className="space-y-24 sm:space-y-32">
          {retreats.map((retreat, i) => (
            <Reveal key={retreat.slug}>
              <article
                className={`grid items-center gap-12 lg:grid-cols-2 lg:gap-20 ${
                  i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <Link
                  href={`/retreats/${retreat.slug}`}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-sm bg-ivory-deep"
                >
                  <Image
                    src={retreat.image}
                    alt={retreat.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.05]"
                  />
                  <span className="absolute left-5 top-5 rounded-full bg-ivory-pale/90 px-4 py-1.5 font-sans text-[0.625rem] font-medium uppercase tracking-[0.18em] text-moss-800 backdrop-blur">
                    {retreat.nights}
                  </span>
                </Link>

                <div>
                  <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                    {retreat.season} · {retreat.cadence}
                  </p>
                  <h2 className="display-lg mt-6 font-light">{retreat.name}</h2>
                  <p className="mt-2 font-bengali text-lg text-moss-500">
                    {retreat.bn}
                  </p>
                  <p className="lede mt-6 font-italic">{retreat.tagline}</p>
                  <p className="body-copy mt-6 max-w-lg">{retreat.summary}</p>

                  <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                    {retreat.includes.slice(0, 4).map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 font-sans text-sm font-light text-ink-soft"
                      >
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-6 border-t border-ink/10 pt-8">
                    <div>
                      <p className="font-display text-[1.75rem] font-light text-ink">
                        {bdt(retreat.priceBdt)}
                      </p>
                      <p className="mt-1 font-sans text-[0.6875rem] uppercase tracking-[0.18em] text-ink/40">
                        per person · approx ${retreat.priceUsd}
                      </p>
                    </div>
                    <Link
                      href={`/retreats/${retreat.slug}`}
                      className="group inline-flex items-center gap-3 font-sans text-[0.75rem] font-medium uppercase tracking-[0.18em] text-moss-700"
                    >
                      <span className="link-underline">Full details</span>
                      <Icon
                        name="arrow"
                        className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1.5"
                      />
                    </Link>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-ivory-deep">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:px-10">
          <Reveal>
            <h2 className="display-md font-light">
              None of these fit? Tell us what you actually need.
            </h2>
            <p className="body-copy mx-auto mt-6 max-w-xl">
              We regularly host longer private stays, small writing residencies,
              and groups of friends who want the whole house. Write to us and we
              will say honestly whether it suits.
            </p>
            <Link href="/contact" className="btn-primary mt-10">
              Enquire
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
