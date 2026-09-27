"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconArrowRight, IconShield, IconSparkles, IconStore } from "@/components/ui/icons";

/**
 * UX plan §4 (R11) — an editorial tile every eighth card in the shop grid.
 * A long run of identical cards makes the thumb stop; one tile in the card's
 * own 4:5 slot breaks the rhythm with something true and useful, rotating
 * through three: Style Match, the delivery promise, the shops behind the
 * pieces. Never an <article> — the grid's cards keep that role to themselves.
 */
export const GRID_INTERRUPT_EVERY = 8;

const TILES = [
  { id: "style", icon: IconSparkles, href: "/style", tone: "bg-forest-900 text-ivory-50", accent: "text-gold-300" },
  { id: "promise", icon: IconShield, href: "/delivery", tone: "bg-gold-100 text-forest-950", accent: "text-forest-800" },
  { id: "shops", icon: IconStore, href: "/shops", tone: "bg-ivory-200 text-forest-950", accent: "text-forest-800" },
] as const;

export type GridInterruptId = (typeof TILES)[number]["id"];

/** Which tile sits after the n-th group of eight (0-based). */
export const gridInterruptFor = (slot: number): GridInterruptId => TILES[slot % TILES.length]!.id;

export default function GridInterrupt({ slot }: { slot: number }) {
  const { t, lang } = useLanguage();
  const tile = TILES[slot % TILES.length]!;
  const Icon = tile.icon;
  return (
    <aside
      data-testid="grid-interrupt"
      data-tile={tile.id}
      aria-label={t(`shopBrowser.tile_${tile.id}Title`)}
      className={`relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-2xl p-5 ${tile.tone}`}
    >
      <Icon className={`h-7 w-7 ${tile.accent}`} aria-hidden />
      <div>
        <p className={`text-[0.62rem] font-semibold uppercase tracking-[0.2em] ${tile.accent}`}>
          {t(`shopBrowser.tile_${tile.id}Eyebrow`)}
        </p>
        <h3
          lang={lang === "bn" ? "bn" : undefined}
          className={`font-display mt-2 text-xl leading-snug sm:text-2xl ${lang === "bn" ? "font-bengali" : ""}`}
        >
          {t(`shopBrowser.tile_${tile.id}Title`)}
        </h3>
        <p className="mt-2 text-xs leading-5 opacity-80">{t(`shopBrowser.tile_${tile.id}Body`)}</p>
        <Link
          href={tile.href}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
        >
          {t(`shopBrowser.tile_${tile.id}Cta`)} <IconArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  );
}
