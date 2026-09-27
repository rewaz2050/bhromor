"use client";

import ProductCard from "@/components/product/product-card";
import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";

/**
 * UX plan §4 (R11) — "এটার সাথে অন্যরা কিনেছেন": pieces from real baskets
 * that held this one, in co-purchase order. Server-ranked (lib/db/also-bought),
 * rendered here so the cards keep their quick-add and wishlist behaviour.
 * Nothing under two pieces — a rail of one is a guess dressed up.
 */
export const MIN_ALSO_BOUGHT = 2;

export default function AlsoBoughtRail({ items }: { items: Product[] }) {
  const { t, lang } = useLanguage();
  if (items.length < MIN_ALSO_BOUGHT) return null;
  return (
    <section
      id="also-bought"
      aria-labelledby="also-bought-heading"
      data-testid="also-bought"
      className="mt-12 scroll-mt-24 px-1"
    >
      <Eyebrow>{t("product.alsoBoughtEyebrow")}</Eyebrow>
      <h2
        id="also-bought-heading"
        lang={lang === "bn" ? "bn" : undefined}
        className={`font-display mt-3 text-2xl font-medium tracking-tight text-forest-900 sm:text-3xl ${lang === "bn" ? "font-bengali" : ""}`}
      >
        {t("product.alsoBoughtTitle")}
      </h2>
      <p className="mt-1.5 text-sm text-ink-soft">{t("product.alsoBoughtSub")}</p>
      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {items.slice(0, 4).map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </div>
    </section>
  );
}
