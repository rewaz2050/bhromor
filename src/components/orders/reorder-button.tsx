"use client";

/**
 * "Order again" — one tap re-adds a past order's lines to the bag and opens
 * it. Explains anything it could not add (gone / sold out / that colour or
 * size no longer offered) and asks before replacing another shop's bag.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { useReorder } from "@/lib/use-reorder";
import type { ReorderLine, SkipReason } from "@/lib/reorder";

const REASON: Record<SkipReason, { en: string; bn: string }> = {
  gone: { en: "no longer listed", bn: "আর নেই" },
  "out-of-stock": { en: "sold out", bn: "স্টক শেষ" },
  variant: { en: "that colour/size is gone — pick again", bn: "ওই রং/সাইজ নেই — আবার বেছে নিন" },
};

export default function ReorderButton({
  lines,
  className = "",
  compact = false,
}: {
  lines: ReorderLine[];
  className?: string;
  /** Small pill (order history rows) vs full-width CTA (track page). */
  compact?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { reorder, replaceBag, reset, outcome, catalogLoading, available } = useReorder();
  if (lines.length === 0 || !available) return null;

  const base = compact
    ? "inline-flex min-h-9 items-center rounded-full bg-gold-500 px-3.5 text-xs font-semibold text-forest-950 hover:bg-gold-400 disabled:opacity-60"
    : "editorial-button w-full bg-gold-500 text-forest-950 hover:bg-gold-400 disabled:opacity-60 sm:w-auto";

  return (
    <div className={className} data-testid="reorder">
      <button
        type="button"
        onClick={() => reorder(lines)}
        disabled={catalogLoading}
        className={base}
        data-testid="reorder-button"
      >
        ↻ {t("track.historyReorder")}
      </button>

      {outcome.kind === "loading" ? (
        <p className="mt-2 text-xs text-ink-soft" role="status">
          {t("track.reorderLoading")}
        </p>
      ) : null}

      {outcome.kind === "conflict" ? (
        <div className="mt-2 rounded-2xl bg-ivory-100 p-3 text-xs text-ink ring-1 ring-line" role="alertdialog" aria-label={t("track.reorderConflictTitle")}>
          <p>{t("track.reorderConflict").replace("{shop}", outcome.fromShopName)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={replaceBag}
              className="rounded-full bg-forest-800 px-3 py-1.5 font-semibold text-ivory-50 hover:bg-forest-700"
            >
              {t("track.reorderReplace")}
            </button>
            <button type="button" onClick={reset} className="rounded-full px-3 py-1.5 font-semibold text-ink-soft underline underline-offset-2">
              {t("track.reorderKeep")}
            </button>
          </div>
        </div>
      ) : null}

      {outcome.kind === "done" ? (
        <div className="mt-2 text-xs" role="status" data-testid="reorder-result">
          <p className={outcome.added > 0 ? "text-forest-800" : "text-rose-800"}>
            {outcome.added > 0
              ? t("track.reorderAdded").replace("{n}", String(outcome.added))
              : t("track.reorderNone")}
          </p>
          {outcome.skipped.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-ink-soft">
              {outcome.skipped.map((s, i) => (
                <li key={i}>
                  {s.name} — {REASON[s.reason][lang === "bn" ? "bn" : "en"]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
