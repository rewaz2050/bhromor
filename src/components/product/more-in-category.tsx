"use client";

import Link from "next/link";
import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Category, Product } from "@/lib/catalog";
import { categoryLabel } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

/**
 * The LAST section of a product page (2026-09-20): scroll past the details
 * and the reviews, and the pieces waiting at the foot of the page are from
 * the SAME category as the one being viewed — the shopper opened a panjabi,
 * so the shelf under it is panjabis — with a scoped "See all N in
 * <category>" link when the category holds more than the row shows.
 * Renders nothing when the category has no other piece.
 */
export default function MoreInCategory({
  category,
  items,
  hiddenCount,
  total,
}: {
  category: Category;
  /** Siblings from the same category (never the current piece). */
  items: Product[];
  /** Siblings that did not fit the row (drives the See-all link). */
  hiddenCount: number;
  /** Discoverable pieces in the category overall (the See-all label). */
  total: number;
}) {
  const { t, lang } = useLanguage();
  if (items.length === 0) return null;
  const label = categoryLabel(category, lang);
  const href = `/shop?category=${encodeURIComponent(category.id)}`;
  const title = fmt(t("home.moreIn"), { category: label });
  return (
    <section
      id="more-in-category"
      aria-labelledby="more-in-category-heading"
      data-testid="more-in-category"
      data-category={category.id}
      className="mt-20 scroll-mt-24 border-t border-line pt-14"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <Eyebrow>{t("home.sameShelf")}</Eyebrow>
          <h2
            id="more-in-category-heading"
            lang={lang === "bn" ? "bn" : undefined}
            className={`font-display mt-3 text-3xl font-medium tracking-tight text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
          >
            <Link href={href} className="transition-colors hover:text-forest-700">
              {title}
            </Link>
          </h2>
        </div>
        {hiddenCount > 0 && (
          <Link href={href} className="editorial-text-link group shrink-0">
            {fmt(t("home.seeAllIn"), { count: total, category: label })}
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="mt-10 flex justify-center">
          <Link
            href={href}
            className="editorial-button bg-forest-900 text-ivory-50 hover:bg-forest-800"
          >
            {fmt(t("home.seeAllIn"), { count: total, category: label })}
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
