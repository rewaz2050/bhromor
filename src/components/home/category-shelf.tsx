"use client";

import Image from "next/image";
import ListImpression from "@/components/analytics/list-impression";
import Link from "next/link";
import ProductCard from "@/components/product/product-card";
import Reveal from "@/components/ui/reveal";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import { categoryLabel, type CategoryShelf as Shelf } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

/**
 * One category block on the homepage (Batch J): a compact banner row (photo,
 * name, count — all one link to the category) followed by the category's
 * pieces in a 2/3/4-column grid. The whole thing is the shelf a shopper
 * would walk past in the physical shop — scroll, look, tap.
 */
export default function CategoryShelfBlock({
  shelf,
  index,
}: {
  shelf: Shelf;
  index: number;
}) {
  const { t, lang } = useLanguage();
  const { category, products, hiddenCount, href } = shelf;
  const label = categoryLabel(category, lang);
  const total = products.length + hiddenCount;
  const headingId = `shelf-${category.id}-heading`;
  const countLabel = total === 1 ? t("home.piece") : fmt(t("home.pieces"), { count: total });

  return (
    <section
      id={`shelf-${category.id}`}
      aria-labelledby={headingId}
      data-testid="category-shelf"
      data-category={category.id}
      data-list={`shelf-${category.id}`}
      className={`scroll-mt-24 ${index % 2 === 0 ? "bg-ivory-50" : "border-y border-line bg-paper"}`}
    >
      <ListImpression list={`shelf-${category.id}`} count={products.length} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Reveal>
          <Link
            href={href}
            className="group flex items-center gap-4 border-b border-line pb-5 sm:gap-6"
          >
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line sm:h-20 sm:w-20">
              {category.image && (
                <Image
                  src={category.image}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-gold-700">
                {countLabel}
              </span>
              <span
                id={headingId}
                lang={lang === "bn" ? "bn" : undefined}
                className={`mt-1 block font-display text-[clamp(1.75rem,3.4vw,2.75rem)] font-normal leading-[1.05] tracking-[-0.03em] text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
                role="heading"
                aria-level={2}
              >
                {label}
              </span>
              {category.tagline && lang === "en" && (
                <span className="mt-1 hidden text-sm text-ink-soft sm:block">{category.tagline}</span>
              )}
            </span>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-900 text-ivory-50 transition-transform group-hover:translate-x-0.5">
              <IconArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </Reveal>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-7">
          {products.map((product, i) => (
            <Reveal key={product.id} delay={Math.min(i, 3) * 60}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>

        {hiddenCount > 0 && (
          <div className="mt-8 flex justify-center">
            <Link
              href={href}
              className="editorial-button bg-forest-900 text-ivory-50 hover:bg-forest-800"
            >
              {fmt(t("home.seeAllIn"), { count: total, category: label })}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
