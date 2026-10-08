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
import { endsAtLabel } from "@/lib/ends-at";
import { ensurePromos, promoNowMs } from "@/lib/use-promos";
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
  // Seeded from the deadline the SERVER published and the clock it published
  // it at: a countdown computed from Date.now() on both sides differs by the
  // few hundred milliseconds between them, and React would tear the text out
  // and repaint it. The ticker below takes over the moment the page is live.
  const [left, setLeft] = useState(() => Math.max(0, endsAtMs - (promoNowMs() ?? Date.now())));
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

/**
 * UX plan §3 (R11) — "(আজ রাত ১১টায় শেষ)": the wall-clock end next to the
 * countdown, in the shop's day (Asia/Dhaka). Re-labelled once a minute so
 * "today" becomes "tomorrow"-safe across midnight; empty once it has passed.
 */
export function FlashEndsAt({ endsAtMs, className = "" }: { endsAtMs: number; className?: string }) {
  const { lang } = useLanguage();
  const [label, setLabel] = useState(() =>
    endsAtLabel(endsAtMs, lang, promoNowMs() ?? Date.now()),
  );
  useEffect(() => {
    const tick = () => setLabel(endsAtLabel(endsAtMs, lang));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [endsAtMs, lang]);
  if (!label) return null;
  return (
    <span data-testid="flash-ends-at" lang={lang === "bn" ? "bn" : undefined} className={className}>
      ({label})
    </span>
  );
}

/** "Starts in 01:12:40" for the window that has not opened yet. */
export function FlashCountup({ atMs }: { atMs: number }) {
  const { t } = useLanguage();
  const [left, setLeft] = useState(() => Math.max(0, atMs - (promoNowMs() ?? Date.now())));
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

/**
 * The thin "how much of the window is gone" line under the flash strip.
 *
 * Scroll audit 2026-09-27: this used to be a `width: N%` restyled from a 1 s
 * React tick — a layout every second on every page. Now it is one CSS
 * transform transition: start at the share already elapsed, reach 100 % at
 * `endsAtMs`, and let the compositor move it — no timer, no layout, no
 * re-render. `msLeftAt`/`progressAt` are the pair the promo store froze at
 * the last phase change (see use-promos.ts), which is all it takes to know
 * the window's length.
 */
export function FlashProgress({
  endsAtMs,
  msLeftAt,
  progressAt,
  className = "",
}: {
  endsAtMs: number | null;
  msLeftAt: number;
  progressAt: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !endsAtMs) return;
    const windowMs = progressAt < 1 && msLeftAt > 0 ? msLeftAt / (1 - progressAt) : 0;
    const msLeft = Math.max(0, endsAtMs - Date.now());
    const now = windowMs > 0 ? Math.min(1, Math.max(0, 1 - msLeft / windowMs)) : 1;
    el.style.transition = "none";
    el.style.transform = `scaleX(${now.toFixed(4)})`;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce || msLeft === 0) return;
    // Flush the start value, then hand the rest of the window to the compositor.
    void el.getBoundingClientRect();
    el.style.transition = `transform ${msLeft}ms linear`;
    el.style.transform = "scaleX(1)";
  }, [endsAtMs, msLeftAt, progressAt]);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="flash-progress"
      className={`block h-0.5 origin-left bg-gold-400/80 ${className}`}
      style={{ transform: `scaleX(${Math.min(1, Math.max(0, progressAt)).toFixed(4)})` }}
    />
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
