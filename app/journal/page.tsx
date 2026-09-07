import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import { posts } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Journal',
  description:
    'Notes from Kamalpur — the tea flush calendar, how the house was built, and what we have learned about doing nothing well.',
};

export default function JournalPage() {
  const [lead, ...rest] = posts;

  return (
    <>
      <section className="mx-auto max-w-8xl px-6 pb-16 pt-44 sm:px-10 sm:pt-52">
        <Reveal>
          <p className="eyebrow">Journal</p>
          <h1 className="display-xl mt-8 max-w-4xl font-light">
            Notes from
            <br />
            <span className="italic text-moss-600">the garden.</span>
          </h1>
          <p className="lede mt-10 max-w-2xl">
            Written by the people who run the place, mostly in the reading room,
            mostly when it is raining.
          </p>
        </Reveal>
      </section>

      {/* Lead entry */}
      <section className="mx-auto max-w-8xl px-6 pb-20 sm:px-10 sm:pb-24">
        <Reveal>
          <Link href={`/journal/${lead.slug}`} className="group block">
            <div className="relative aspect-[16/9] overflow-hidden rounded-sm bg-ivory-deep">
              <Image
                src={lead.image}
                alt={lead.title}
                fill
                priority
                sizes="100vw"
                className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.04]"
              />
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
              <span className="text-moss-600">{lead.category}</span>
              <span>{lead.dateLabel}</span>
              <span>{lead.minutes} min read</span>
            </div>
            <h2 className="display-lg mt-5 max-w-3xl font-light transition-colors duration-500 group-hover:text-moss-600">
              {lead.title}
            </h2>
            <p className="lede mt-5 max-w-2xl">{lead.excerpt}</p>
            <span className="mt-6 inline-flex items-center gap-3 font-sans text-[0.75rem] font-medium uppercase tracking-[0.18em] text-moss-700">
              <span className="link-underline">Read the entry</span>
              <Icon
                name="arrow"
                className="h-4 w-4 transition-transform duration-500 ease-calm group-hover:translate-x-1.5"
              />
            </span>
          </Link>
        </Reveal>
      </section>

      {/* Remaining entries */}
      <section className="border-t border-ink/10 bg-ivory-pale">
        <div className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-28">
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {rest.map((post, i) => (
              <Reveal key={post.slug} delay={i * 80}>
                <Link
                  href={`/journal/${post.slug}`}
                  className="group grid items-center gap-6 py-10 md:grid-cols-[1fr_auto] md:gap-12"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-x-5 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
                      <span className="text-moss-600">{post.category}</span>
                      <span>{post.dateLabel}</span>
                    </div>
                    <h2 className="display-md mt-4 font-light transition-colors duration-500 group-hover:text-moss-600">
                      {post.title}
                    </h2>
                    <p className="mt-3 max-w-2xl font-sans text-sm font-light leading-relaxed text-ink-soft">
                      {post.excerpt}
                    </p>
                  </div>
                  <div className="relative hidden aspect-[3/2] w-56 shrink-0 overflow-hidden rounded-sm md:block">
                    <Image
                      src={post.image}
                      alt=""
                      fill
                      sizes="224px"
                      className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.06]"
                    />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
