"use client";

import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/catalog";
import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";

export default function ShopHeroHeader({
  categories,
}: {
  categories: Category[];
}) {
  const { t, lang } = useLanguage();
  const isBn = lang === "bn";
  return (
    <section className="overflow-hidden border-b border-line bg-ivory-100">
      <div className="mx-auto grid max-w-7xl md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
        <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <nav
            aria-label="Breadcrumb"
            className="mb-7 flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.18em] text-ink-soft"
          >
            <Link href="/" className="hover:text-forest-800">
              {t("shop.breadcrumbHome")}
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t("shop.breadcrumbCollection")}</span>
          </nav>
          <Eyebrow>{t("shop.eyebrow")}</Eyebrow>
          <h1 className="mt-4 font-display text-4xl font-normal tracking-tight text-forest-900 sm:text-5xl lg:text-6xl">
            {t("shop.title1")}{" "}
            <span className="italic text-gold-600">{t("shop.title2")}</span>
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-ink-soft">
            {t("shop.subtitle")}
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {categories
              .filter((item) => item.active !== false)
              .map((item) => (
                <Link
                  key={item.id}
                  href={`/shop?category=${item.id}`}
                  className="editorial-text-link"
                >
                  {isBn ? item.nameBn : item.name}
                </Link>
              ))}
          </div>
        </div>
        <div className="relative hidden bg-ivory-200 md:block">
          <Image
            src="/images/products/panjabi-detail.jpg"
            loading="eager"
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, 280px"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-5 border border-ivory-100/50"
          />
        </div>
      </div>
    </section>
  );
}
