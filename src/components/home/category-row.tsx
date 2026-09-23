"use client";

import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Category, Product } from "@/lib/catalog";
import { categoryLabel, categoryShelves } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

/**
 * The category row (2026-09-20) — the first thing under the compact hero.
 *
 * One tile per active category that actually has pieces (photo, name,
 * count), each tile a link into the filtered shop. A snap-scrolling row on
 * phones, a grid from `sm`. Empty categories never get a tile: a dead tile
 * is worse than no tile.
 */
export default function CategoryRow({
  pool,
  categories,
}: {
  pool: Product[];
  categories: Category[];
}) {
  const { t, lang } = useLanguage();
  const shelves = categoryShelves(pool, categories, 0);
  if (shelves.length === 0) return null;

  return (
    <section
      // `#collections` is what the header / drawer "Collections" link jumps to.
      id="collections"
      aria-labelledby="categories-heading"
      data-testid="category-row"
      className="scroll-mt-24 border-b border-line bg-ivory-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="max-w-2xl">
            <Eyebrow>{t("home.categoriesEyebrow")}</Eyebrow>
            <h2
              id="categories-heading"
              lang={lang === "bn" ? "bn" : undefined}
              className={`mt-2 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-normal leading-[1.08] tracking-[-0.03em] text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
            >
              {t("home.categoriesTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{t("home.categoriesSub")}</p>
          </div>
          <Link href="/shop" className="editorial-text-link group shrink-0">
            {t("home.chipAll")}
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>

        {/* One flex row: snap-scrolls on phones, wraps into fixed-width
            tiles from `sm` so three categories sit as a neat row and
            twelve wrap evenly — no half-empty grid either way. */}
        <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0">
          {shelves.map((shelf, index) => {
            const { category, products } = shelf;
            const label = categoryLabel(category, lang);
            const count =
              products.length === 1
                ? t("home.piece")
                : fmt(t("home.pieces"), { count: products.length });
            return (
              <li
                key={category.id}
                data-testid="category-tile"
                data-category={category.id}
                className="w-[44vw] min-w-[150px] max-w-[220px] shrink-0 snap-start sm:w-[200px] sm:max-w-none lg:w-[224px]"
              >
                <Reveal delay={Math.min(index, 4) * 60}>
                  <Link href={shelf.href} className="group block">
                    <span className="relative block aspect-[5/4] overflow-hidden rounded-md bg-ivory-200 ring-1 ring-line">
                      {category.image && (
                        <Image
                          src={category.image}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 224px, (min-width: 640px) 200px, 44vw"
                          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-forest-950/25 via-transparent to-transparent"
                      />
                      <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-ivory-50/92 text-forest-900 backdrop-blur-sm transition-colors group-hover:bg-forest-900 group-hover:text-ivory-50">
                        <IconArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="mt-3 flex items-baseline justify-between gap-2">
                      <span
                        lang={lang === "bn" ? "bn" : undefined}
                        className={`truncate font-display text-lg font-medium tracking-[-0.02em] text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                        {count}
                      </span>
                    </span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
