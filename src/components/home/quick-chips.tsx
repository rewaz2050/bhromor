"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";
import { bnDigits } from "@/lib/arrival";
import { quickChips } from "@/lib/quick-chips";
import { IconArrowRight } from "@/components/ui/icons";

/**
 * UX plan §2 (R11) — the quick-chip row right under the hero: the four or
 * five intents a first-screen visitor arrives with ("cheap", "for Eid",
 * "a gift", "today", "on sale", "new"), each one tap into the shop with the
 * filter already set and the real count on the chip. A horizontal snap rail
 * on phones, one line on wider screens; nothing at all when the shelf
 * cannot honour at least two of them.
 */
export default function QuickChips({ pool }: { pool: readonly Product[] }) {
  const { lang, t } = useLanguage();
  const chips = quickChips(pool);
  if (chips.length === 0) return null;
  return (
    <nav
      aria-label={t("home.quickChipsLabel")}
      data-testid="quick-chips"
      className="border-b border-line bg-paper"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:thin] sm:px-6 lg:px-8">
        <span className="hidden shrink-0 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-ink-soft sm:inline">
          {t("home.quickChipsEyebrow")}
        </span>
        {chips.map((chip) => (
          <Link
            key={chip.id}
            href={chip.href}
            data-testid={`quick-chip-${chip.id}`}
            className="inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full bg-ivory-100 px-3.5 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-gold-100 hover:ring-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
          >
            <span>{lang === "bn" ? chip.bn : chip.en}</span>
            <span className="rounded-full bg-paper px-1.5 py-0.5 text-[0.65rem] font-bold text-ink-soft ring-1 ring-line">
              {lang === "bn" ? bnDigits(String(chip.count)) : chip.count}
            </span>
          </Link>
        ))}
        <Link
          href="/shop"
          className="ml-auto hidden min-h-11 shrink-0 items-center gap-1 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-forest-800 hover:text-forest-950 lg:inline-flex"
        >
          {t("home.quickChipsAll")}
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </nav>
  );
}
