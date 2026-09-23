"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { coverImage, type Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { forgetViews } from "@/lib/recently-viewed";
import { useRecentlyViewed } from "@/lib/use-recently-viewed";

/**
 * Homepage "continue where you left off" — a single compact row of the
 * pieces this device viewed recently. Deliberately small (thumbnail + name
 * + price) so the category row stays on the first screen; it only exists
 * for a returning shopper and can be cleared in one tap.
 */
export default function RecentlyViewedStrip({ pool, limit = 6 }: { pool: Product[]; limit?: number }) {
  const { t, lang } = useLanguage();
  const items = useRecentlyViewed(pool, { limit });
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="recent-strip-heading"
      data-testid="recently-viewed-strip"
      className="border-b border-line bg-ivory-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="recent-strip-heading"
            className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-soft"
          >
            {t("home.recentEyebrow")}
          </h2>
          <button
            type="button"
            onClick={forgetViews}
            className="min-h-9 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-forest-800 hover:underline"
          >
            {t("home.recentClear")}
          </button>
        </div>
        <ul className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:px-0">
          {items.map((p) => {
            const cover = coverImage(p);
            const bn = lang === "bn" && p.nameBn?.trim();
            return (
              <li key={p.id} className="shrink-0">
                <Link
                  href={`/product/${p.slug}`}
                  className="flex min-h-11 w-56 items-center gap-3 rounded-md bg-paper p-1.5 pr-3 ring-1 ring-line transition-colors hover:ring-forest-400"
                >
                  <span className="relative block h-14 w-12 shrink-0 overflow-hidden bg-ivory-100">
                    {cover.src ? (
                      <Image src={cover.src} alt="" aria-hidden="true" fill sizes="48px" className="object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span
                      lang={bn ? "bn" : undefined}
                      className={`block truncate text-sm text-forest-900 ${bn ? "font-bengali" : ""}`}
                    >
                      {bn || p.name}
                    </span>
                    <span className="block text-xs text-ink-soft">{formatBdt(p.price)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
