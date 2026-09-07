import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import Marquee from '@/components/Marquee';
import Icon from '@/components/Icon';
import { site } from '@/lib/content';

export const metadata: Metadata = {
  title: 'The house',
  description:
    'Nine rooms built from salvaged teak and local brick on a working tea estate at the foot of the Khasi hills. How PROSANTI came to be.',
};

const timeline = [
  {
    year: '2016',
    title: 'A lease on a ruin',
    body: 'We signed for a collapsing estate bungalow and forty-two acres of terraced hillside, mostly because the view from the doorway was unreasonable.',
  },
  {
    year: '2017',
    title: 'Four years of building, badly then better',
    body: 'Salvaged teak from demolished houses in Sunamganj, brick fired eleven kilometres away, and a roof pitch we got wrong twice before a Kamalpur carpenter settled it.',
  },
  {
    year: '2019',
    title: 'Nine rooms, open',
    body: 'PROSANTI opened in October with three guests, one cook, and no signage on the road. The first guest book is still in the reading room.',
  },
  {
    year: '2022',
    title: 'The spring bath',
    body: 'We found water forty metres up the hill, cut a tub from local stone, and decided it would only ever hold one person at a time.',
  },
  {
    year: '2026',
    title: 'Still nine rooms',
    body: 'Eleven staff, nine rooms, and a firm decision not to grow. Every offer to expand has been declined.',
  },
];

const values = [
  {
    bn: 'স্থান',
    title: 'Buy local or do without',
    body: 'Almost everything here was made within thirty kilometres: the brick, the timber work, the pots, the linen. What we cannot source nearby, we often simply go without.',
  },
  {
    bn: 'বেতন',
    title: 'Pay the estate fairly',
    body: 'We buy all our tea from Kamalpur at an agreed premium over market, and eleven of our staff live in the village. Turnover since opening has been one departure.',
  },
  {
    bn: 'সীমা',
    title: 'Stay small on purpose',
    body: 'Nine rooms is the number this hill can carry without a generator, a coach park, or a queue. Growth would cost us the reason anyone comes.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Page header */}
      <section className="relative overflow-hidden bg-moss-950 pb-24 pt-44 text-ivory-pale sm:pt-52">
        <div className="absolute inset-0 opacity-40">
          <Image
            src="/images/pavilion.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-moss-950/80 via-moss-950/60 to-moss-950" />
        </div>

        <div className="relative mx-auto max-w-8xl px-6 sm:px-10">
          <Reveal>
            <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-200">
              The house
            </p>
            <h1 className="display-xl mt-8 max-w-4xl font-light">
              Built slowly,
              <br />
              <span className="italic text-brass-200">mostly by hand.</span>
            </h1>
            <p className="lede mt-10 max-w-xl !text-ivory-deep/80">
              PROSANTI is nine rooms on a working tea estate in Sylhet, built
              from what the valley and the villages around it could give us.
            </p>
          </Reveal>
        </div>
      </section>

      <Marquee />

      {/* Story */}
      <section className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
        <div className="grid gap-16 lg:grid-cols-[0.85fr_1fr] lg:gap-24">
          <Reveal>
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="eyebrow">How it started</p>
              <h2 className="display-lg mt-8 font-light">
                We did not set out to build a retreat.
              </h2>
            </div>
          </Reveal>

          <div className="space-y-7">
            {[
              'We bought a broken house on a hillside in 2016 with no plan beyond restoring it. The bungalow had been the estate manager’s home since 1954, and by the time we found it the roof was open to the sky and a fig tree was growing through the floor of what had been the drawing room.',
              'The restoration took four years, which is longer than any of us intended and shorter than the building needed. We used timber from houses being demolished in Sunamganj, brick fired eleven kilometres away, and local labour throughout. Nothing here was shipped from Dhaka that could reasonably be made in Sylhet.',
              'When it was finished we realised we had built a house that was very good at being quiet. We had no children, no dog, and too many bedrooms. So in October 2019 we opened nine of them to guests and kept the kitchen in the old bungalow, because it was already the warmest room on the property and we could not improve on that.',
              'The name came late. প্রশান্তি — prosanti — is not a grand word. It is the ordinary Bengali word for the particular quiet that settles after rain, when the noise has stopped and nothing has started yet. It is the feeling we were trying to protect.',
            ].map((para, i) => (
              <Reveal key={i} delay={i * 90}>
                <p className="body-copy text-[1.0625rem]">{para}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
          <div className="grid gap-16 lg:grid-cols-3">
            {values.map((value, i) => (
              <Reveal key={value.title} delay={i * 120}>
                <div className="flex h-full flex-col">
                  <span className="font-bengali text-xl text-moss-500">
                    {value.bn}
                  </span>
                  <div className="mt-6 h-px w-12 bg-moss-400" />
                  <h3 className="display-md mt-8 font-light">{value.title}</h3>
                  <p className="body-copy mt-5">{value.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="mx-auto max-w-8xl px-6 py-28 sm:px-10 sm:py-36">
        <Reveal>
          <p className="eyebrow">Ten years, briefly</p>
        </Reveal>

        <div className="mt-16 border-t border-ink/10">
          {timeline.map((item, i) => (
            <Reveal key={item.year} delay={i * 70}>
              <div className="group grid gap-4 border-b border-ink/10 py-10 md:grid-cols-[10rem_1fr_1.2fr] md:gap-10">
                <span className="font-display text-[1.75rem] font-light text-moss-600 transition-colors duration-500 group-hover:text-moss-800">
                  {item.year}
                </span>
                <h3 className="font-sans text-[0.9375rem] font-medium text-ink md:pt-2">
                  {item.title}
                </h3>
                <p className="body-copy md:pt-1">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Spring bath + kitchen imagery */}
      <section className="mx-auto max-w-8xl px-6 pb-28 sm:px-10 sm:pb-36">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              src: '/images/spring-bath.jpg',
              alt: 'Stone soaking tub fed by a hillside spring',
              caption: 'The spring bath — cut from local stone, heated by wood fire, reserved to one guest at a time.',
            },
            {
              src: '/images/kitchen.jpg',
              alt: 'The wood-fired kitchen in the old estate bungalow',
              caption: 'The kitchen, still in the 1954 bungalow, still the warmest room on the property.',
            },
          ].map((img, i) => (
            <Reveal key={img.src} delay={i * 120}>
              <figure className="group">
                <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-ivory-deep">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 45vw"
                    className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.05]"
                  />
                </div>
                <figcaption className="mt-5 font-sans text-sm font-light leading-relaxed text-ink-soft">
                  {img.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="bg-moss-900 text-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-32">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-end">
              <h2 className="display-lg max-w-2xl font-light text-ivory-pale">
                The easiest way to understand the house is to sit in it for three
                days.
              </h2>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/retreats"
                  className="btn-primary !bg-ivory-pale !text-moss-950 hover:!bg-brass-200"
                >
                  See the retreats
                </Link>
                <Link href="/contact" className="btn-ghost !border-ivory/25 !text-ivory-deep hover:!bg-ivory-pale hover:!text-moss-950">
                  Ask us something
                </Link>
              </div>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-14 flex items-center gap-3 font-sans text-xs uppercase tracking-[0.18em] text-ivory-deep/40">
              <Icon name="leaf" className="h-4 w-4 text-brass-300" />
              {site.location} · {site.established}
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
