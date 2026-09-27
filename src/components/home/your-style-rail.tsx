"use client";

/**
 * "New in your style" (UX plan §10, R7) — Style Match, promoted from the
 * home page and remembered. A device that built a style on /style gets a
 * rail of the pieces that match it (newest first among equals, in stock);
 * everyone else gets a slim three-tap invite. Hidden below two matches.
 */

import Link from "next/link";
import { useSyncExternalStore } from "react";
import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import type { Product } from "@/lib/catalog";
import { STYLE_OCCASIONS, styleMatch, type StyleQuery } from "@/lib/style-match";
import { getStoredStyle, getStoredStyleServer, subscribeStoredStyle } from "@/lib/style-memory";

export const YOUR_STYLE_MIN = 2;

/** Matches for the remembered style: in stock, new pieces ahead of equals. */
export const yourStylePicks = (products: Product[], query: StyleQuery, limit = 8): Product[] => {
  const ranked = styleMatch(
    products.filter((p) => p.inStock),
    query,
    limit * 2,
  );
  return ranked
    .map((m, index) => ({ m, index }))
    .sort((a, b) => b.m.score - a.m.score || Number(!!b.m.product.isNew) - Number(!!a.m.product.isNew) || a.index - b.index)
    .map(({ m }) => m.product)
    .slice(0, limit);
};

export default function YourStyleRail({ pool }: { pool: Product[] }) {
  const { t, lang } = useLanguage();
  const stored = useSyncExternalStore(subscribeStoredStyle, getStoredStyle, getStoredStyleServer);

  if (!stored) {
    return (
      <section
        aria-labelledby="your-style-invite-heading"
        data-testid="your-style-invite"
        className="border-y border-line bg-ivory-50"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <Eyebrow>{t("home.styleInviteEyebrow")}</Eyebrow>
            <h2
              id="your-style-invite-heading"
              className="mt-2 font-display text-2xl leading-tight text-forest-900 sm:text-3xl"
            >
              {t("home.styleInviteTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{t("home.styleInviteSub")}</p>
          </div>
          <Link
            href="/style"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("home.styleInviteCta")}
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  const picks = yourStylePicks(pool, stored.query);
  if (picks.length < YOUR_STYLE_MIN) return null;
  const occasion = STYLE_OCCASIONS.find((o) => o.id === stored.query.occasion);
  const sub = occasion
    ? t("home.styleSub").replace("{occasion}", lang === "bn" ? occasion.labelBn : occasion.label)
    : t("home.styleSubPlain");
  return (
    <ProductRail
      id="your-style-rail"
      testId="rail-your-style"
      eyebrow={t("home.styleEyebrow")}
      title={t("home.styleTitle")}
      sub={sub}
      href="/style"
      seeAllLabel={t("home.styleSeeAll")}
      products={picks}
      tone="ivory"
    />
  );
}
