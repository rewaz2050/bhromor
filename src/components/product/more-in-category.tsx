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
 * Product page tail (Batch J): scroll past the details and the next pieces
 * are siblings from the SAME category — the shopper opened a panjabi, so the
 * shelf under it is panjabis — with a scoped "See all N in <category>" link.
 * Featured pieces from other categories only top the row up when the
 * category itself is short.
 */
export default function MoreInCategory({
  category,
  items,
  sameCategory,
  total,
}: {
  category: Category;
  items: Product[];
  /** How many of `items` are true siblings (the rest are fill). */
  sameCategory: number;
  /** Discoverable siblings in the category overall (for the See-all label). */
  total: number;
}) {
  const { t, lang } = useLanguage();
  if (items.length === 0) return null;
  const label = categoryLabel(category, lang);
  const href = `/shop?category=${encodeURIComponent(category.id)}`;
  const title = fmt(t("home.moreIn"), { category: label });
  return (
    <section
      aria-labelledby="more-in-category-heading"
      data-testid="more-in-category"
      className="mt-20 scroll-mt-24"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <Eyebrow>{lang === "bn" ? "একই শেলফ থেকে" : "From the same shelf"}</Eyebrow>
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
        {total > sameCategory && (
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
    </section>
  );
}
