import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import { posts, site } from '@/lib/content';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: `${post.title} — PROSANTI Journal`,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: [{ url: post.image, width: 1200, height: 800 }],
    },
  };
}

export default async function JournalEntry({ params }: Props) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();

  const others = posts.filter((p) => p.slug !== post.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: site.name },
    image: post.image,
  };

  return (
    <>
      <article>
        <header className="mx-auto max-w-3xl px-6 pb-12 pt-44 sm:px-10 sm:pt-52">
          <Reveal>
            <Link
              href="/journal"
              className="group inline-flex items-center gap-3 font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-ink/50 transition-colors hover:text-ink"
            >
              <Icon
                name="arrow"
                className="h-4 w-4 rotate-180 transition-transform duration-500 ease-calm group-hover:-translate-x-1.5"
              />
              Journal
            </Link>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
              <span className="text-moss-600">{post.category}</span>
              <span>{post.dateLabel}</span>
              <span>{post.minutes} min read</span>
            </div>
            <h1 className="display-lg mt-6 font-light">{post.title}</h1>
            <p className="mt-6 font-sans text-sm text-ink/50">
              Words by {post.author}
            </p>
          </Reveal>
        </header>

        <Reveal delay={150}>
          <figure className="mx-auto max-w-6xl px-6 sm:px-10">
            <div className="relative aspect-[16/9] overflow-hidden rounded-sm bg-ivory-deep">
              <Image
                src={post.image}
                alt={post.title}
                fill
                priority
                sizes="(max-width: 1152px) 100vw, 1152px"
                className="object-cover"
              />
            </div>
          </figure>
        </Reveal>

        <div className="mx-auto max-w-3xl px-6 py-20 sm:px-10 sm:py-24">
          <Reveal>
            <p className="font-display text-[clamp(1.25rem,2.2vw,1.625rem)] font-light leading-[1.5] text-ink">
              {post.excerpt}
            </p>
          </Reveal>

          <div className="mt-12 space-y-7">
            {post.body.map((para, i) => (
              <Reveal key={i} delay={Math.min(i * 60, 300)}>
                <p className="body-copy text-[1.0625rem]">{para}</p>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-ink/10 pt-10">
              <div>
                <p className="font-sans text-sm font-medium text-ink">
                  {post.author}
                </p>
                <p className="mt-1 font-sans text-xs uppercase tracking-[0.18em] text-ink/40">
                  {site.name}, Sylhet
                </p>
              </div>
              <Link href="/contact" className="btn-ghost">
                Come and see it
              </Link>
            </div>
          </Reveal>
        </div>
      </article>

      <section className="border-t border-ink/10 bg-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-28">
          <Reveal>
            <p className="eyebrow">More from the journal</p>
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {others.map((other, i) => (
              <Reveal key={other.slug} delay={i * 100}>
                <Link href={`/journal/${other.slug}`} className="group block">
                  <div className="relative aspect-[3/2] overflow-hidden rounded-sm">
                    <Image
                      src={other.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 45vw"
                      className="object-cover transition-transform duration-[1.4s] ease-calm group-hover:scale-[1.05]"
                    />
                  </div>
                  <p className="mt-5 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-moss-600">
                    {other.category} · {other.dateLabel}
                  </p>
                  <h2 className="display-md mt-3 font-light transition-colors duration-500 group-hover:text-moss-600">
                    {other.title}
                  </h2>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
