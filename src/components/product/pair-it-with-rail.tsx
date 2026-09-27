"use client";

import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";

/**
 * UX plan §4 (R11) — "Pair it with": the complement pieces RIGHT under the
 * buy panel (the one-tap set sits just above it when the pairing is real),
 * not a page-length below. A short row — four at most, horizontal on a
 * phone — so it reads as a suggestion, not another shelf.
 */
export default function PairItWithRail({ items }: { items: Product[] }) {
  const { t, lang } = useLanguage();
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="pair-it-with-heading"
      data-testid="pair-it-with"
      className="mt-10 px-1"
    >
      <Eyebrow>{t("bag.pairItWith")}</Eyebrow>
      <h2
        id="pair-it-with-heading"
        lang={lang === "bn" ? "bn" : undefined}
        className={`font-display mt-2 text-2xl font-medium tracking-tight text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
      >
        {t("product.pairTitle")}
      </h2>
      <div className="-mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-10 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {items.slice(0, 4).map((item) => (
          <div key={item.id} className="w-[68vw] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <ProductCard product={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
