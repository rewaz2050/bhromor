"use client";

/**
 * Countdown + flash price primitives (P0 #3).
 *
 * The clock is derived from the deadline the server published, then ticked
 * locally — one fetch per window, not one per second. At zero the store is
 * re-read so the price visibly goes back rather than sitting there lying.
 */

import { useEffect, useRef, useState } from "react";
import { countdownLabel } from "@/lib/promos";
import { ensurePromos } from "@/lib/use-promos";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatBdt } from "@/lib/format";
import { IconBolt } from "@/components/ui/icons";

export function FlashTimer({
  endsAtMs,
  className = "",
}: {
  endsAtMs: number;
  className?: string;
}) {
  const { t } = useLanguage();
  const [left, setLeft] = useState(() => Math.max(0, endsAtMs - Date.now()));
  const refreshed = useRef(false);

  useEffect(() => {
    refreshed.current = false;
    const tick = () => {
      const next = Math.max(0, endsAtMs - Date.now());
      setLeft(next);
      if (next === 0 && !refreshed.current) {
        refreshed.current = true;
        void ensurePromos();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  return (
    <span className={`tabular-nums ${className}`}>
      {t("promo.endsIn").replace("{time}", countdownLabel(left))}
    </span>
  );
}

/** "Starts in 01:12:40" for the window that has not opened yet. */
export function FlashCountup({ atMs }: { atMs: number }) {
  const { t } = useLanguage();
  const [left, setLeft] = useState(() => Math.max(0, atMs - Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = Math.max(0, atMs - Date.now());
      setLeft(next);
      if (next === 0) void ensurePromos();
    }, 1000);
    return () => window.clearInterval(id);
  }, [atMs]);
  return (
    <span className="tabular-nums">
      {t("promo.opensSoon").replace("{time}", countdownLabel(left))}
    </span>
  );
}

/** The live price, with the list price struck through beside it. */
export function FlashPrice({
  price,
  was,
  pct,
  size = "md",
}: {
  price: number;
  was: number;
  pct: number;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useLanguage();
  const cls = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-lg";
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${cls}`}>
      <span className="font-semibold tracking-tight text-gold-700">{formatBdt(price)}</span>
      <span className="text-[0.82em] font-normal text-ink-soft/75 line-through decoration-1">
        {formatBdt(was)}
      </span>
      <span className="inline-flex items-center gap-1 rounded-sm bg-gold-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-gold-700">
        <IconBolt className="h-3 w-3" />
        {t("promo.pctOff").replace("{pct}", String(pct))}
      </span>
    </p>
  );
}

/** Corner ribbon for a card in the drop. */
export function FlashRibbon({ pct }: { pct: number }) {
  const { t } = useLanguage();
  return (
    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-gold-500 px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-forest-950">
      <IconBolt className="h-3 w-3" />
      {t("promo.pctOff").replace("{pct}", String(pct))}
    </span>
  );
}
