"use client";

import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Category, Product } from "@/lib/catalog";
import { categoryInitial, categoryLabel, categoryShelves } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

/**
 * Category shortcuts — the primary browse rail after the hero and any
 * returning-shopper rows. Phones get compact image-and-label shortcuts in a
 * snap rail; wider screens keep the larger editorial photo cards. Empty
 * categories never get a tile: a dead tile is worse than no tile.
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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-10 lg:px-8">
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
        <ul
          data-testid="category-shortcut-rail"
          className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:flex-wrap sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0"
        >
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
                className="w-[76px] min-w-[76px] shrink-0 snap-start sm:w-[200px] sm:min-w-0 sm:max-w-none lg:w-[224px]"
              >
                <Reveal delay={Math.min(index, 4) * 60}>
                  <Link href={shelf.href} className="group block">
                    <span className="relative mx-auto block h-[4.25rem] w-[4.25rem] overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line sm:mx-0 sm:h-auto sm:w-full sm:aspect-[5/4] sm:rounded-md">
                      {category.image ? (
                        <Image
                          src={category.image}
                          alt=""
                          fill
                          /* The first two photo shortcuts are likely to be
                             seen immediately after the hero; later categories
                             remain lazy to keep the mobile shelf light. */
                          priority={index < 2}
                          sizes="(min-width: 1024px) 224px, (min-width: 640px) 200px, 68px"
                          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 flex items-center justify-center bg-forest-100 font-display text-2xl text-forest-700 sm:text-5xl"
                        >
                          {categoryInitial(category, lang)}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 hidden bg-gradient-to-t from-forest-950/25 via-transparent to-transparent sm:block"
                      />
                      <span className="absolute bottom-2 right-2 hidden h-9 w-9 items-center justify-center rounded-full bg-ivory-50/95 text-forest-900 transition-colors group-hover:bg-forest-900 group-hover:text-ivory-50 sm:flex">
                        <IconArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="mt-2 flex flex-col items-center gap-0.5 sm:mt-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                      <span
                        lang={lang === "bn" ? "bn" : undefined}
                        className={`min-w-0 max-w-full truncate text-center font-display text-[0.78rem] font-medium leading-tight tracking-[-0.01em] text-forest-900 sm:text-left sm:text-lg sm:tracking-[-0.02em] ${lang === "bn" ? "font-bengali" : ""}`}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-center text-[0.55rem] font-medium text-ink-soft sm:text-left sm:text-[0.6rem] sm:font-semibold sm:uppercase sm:tracking-[0.16em]">
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
