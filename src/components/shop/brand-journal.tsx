"use client";

import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

const JOURNAL_IMAGES = [
  {
    src: "/images/editorial/journal-women.jpg",
    altKey: "brandJournal.alt1",
    className: "col-span-3 row-span-2 sm:col-span-5",
    sizes: "(min-width: 1024px) 470px, (min-width: 640px) 55vw, 65vw",
  },
  {
    src: "/images/editorial/journal-heritage.jpg",
    altKey: "brandJournal.alt2",
    className: "col-span-3 row-span-2 sm:col-span-4",
    sizes: "(min-width: 1024px) 380px, (min-width: 640px) 40vw, 65vw",
  },
  {
    src: "/images/products/panjabi-detail.jpg",
    altKey: "brandJournal.alt3",
    className: "hidden sm:col-span-3 sm:block",
    sizes: "(min-width: 1024px) 280px, (min-width: 640px) 30vw, 65vw",
  },
  {
    src: "/images/products/three-piece-detail.jpg",
    altKey: "brandJournal.alt4",
    className: "hidden sm:col-span-3 sm:block",
    sizes: "(min-width: 1024px) 280px, (min-width: 640px) 30vw, 65vw",
  },
] as const;

/**
 * An owned editorial journal rather than another product rail or a fabricated
 * social feed. This keeps the homepage visual without repeating the catalogue.
 */
export default function BrandJournal() {
  const { t } = useLanguage();
  return (
    <section
      id="journal"
      aria-labelledby="journal-heading"
      className="scroll-mt-28 border-b border-line bg-ivory-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="mb-9 grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <Eyebrow>{t("brandJournal.eyebrow")}</Eyebrow>
            <h2
              id="journal-heading"
              className="mt-4 font-display text-[clamp(2.35rem,4.4vw,4.25rem)] font-normal leading-[1.04] tracking-[-0.035em] text-forest-900"
            >
              {t("brandJournal.heading")}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-ink-soft sm:text-[0.95rem]">
              {t("brandJournal.body")}
            </p>
          </div>
          <Link href="/story" className="editorial-text-link justify-self-start lg:justify-self-end">
            {t("brandJournal.discover")}
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        <div className="journal-grid grid auto-rows-[180px] grid-cols-6 gap-2.5 sm:auto-rows-[220px] sm:grid-cols-12 sm:gap-3">
          {JOURNAL_IMAGES.map((image) => (
            <figure
              key={image.src}
              className={`relative min-w-0 overflow-hidden bg-ivory-200 ${image.className}`}
            >
              <Image
                src={image.src}
                alt={t(image.altKey)}
                fill
                sizes={image.sizes}
                className="object-cover transition-transform duration-700 ease-out hover:scale-[1.02]"
              />
            </figure>
          ))}
        </div>
        <p className="mt-4 text-[0.62rem] font-medium uppercase tracking-[0.2em] text-ink-soft">
          {t("brandJournal.caption")}
        </p>
      </div>
    </section>
  );
}
