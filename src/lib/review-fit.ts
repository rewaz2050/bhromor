/**
 * "Will it fit me?" — answered by the people who already bought it
 * (fit-data pass, 2026-10-06).
 *
 * The storefront's biggest unsolved question is size, and the plan's
 * true-to-size bar had been waiting on data nobody was collecting. This is
 * the collection side: one tap on the review form (ছোট / ঠিক / বড়) instead
 * of a rating the shopper has to think about, plus the return form's
 * "how was the size?" tap.
 *
 * Rules that keep the number honest:
 *  • only APPROVED reviews count — an unmoderated review is an allegation;
 *  • nothing is shown below MIN_FIT_REVIEWS answers, so two opinions can
 *    never become a statistic on a product page;
 *  • no clear lean means no verdict — "মিশ্র" is an answer, not a failure.
 *
 * Pure (unit-tested).
 */

import { bnDigits } from "./arrival";
import type { Language } from "./translations";

export type FitKey = "small" | "true" | "large";

export const FIT_KEYS: readonly FitKey[] = ["small", "true", "large"];

export const isFitKey = (value: unknown): value is FitKey =>
  typeof value === "string" && (FIT_KEYS as readonly string[]).includes(value);

export interface FitOption {
  key: FitKey;
  label: string;
  /** Shown under the chip once chosen — what the shop will learn. */
  hint: string;
}

export const fitOptions = (lang: Language = "bn"): FitOption[] => [
  lang === "bn"
    ? { key: "small", label: "ছোট", hint: "সাইজ ছোট পেয়েছি" }
    : { key: "small", label: "Runs small", hint: "Smaller than expected" },
  lang === "bn"
    ? { key: "true", label: "ঠিক ছিল", hint: "ঠিক মাপের" }
    : { key: "true", label: "True to size", hint: "Just as expected" },
  lang === "bn"
    ? { key: "large", label: "বড়", hint: "সাইজ বড় পেয়েছি" }
    : { key: "large", label: "Runs large", hint: "Bigger than expected" },
];

/** The short badge a single review row wears, e.g. "সাইজ: ছোট". */
export const fitBadge = (key: FitKey, lang: Language = "bn"): string => {
  const word = fitOptions(lang).find((o) => o.key === key)?.label ?? key;
  return lang === "bn" ? `সাইজ: ${word}` : `Size: ${word}`;
};

/** Below this many answers the product page says nothing at all. */
export const MIN_FIT_REVIEWS = 3;

export interface FitSummary {
  /** Approved answers only. */
  total: number;
  counts: Record<FitKey, number>;
  truePct: number;
  /** The lean, or null when the answers are genuinely mixed. */
  verdict: FitKey | null;
  /** "৮০% বলেছেন সাইজ ঠিক" — the one line the product page prints. */
  label: string;
}

const label = (
  key: FitKey | null,
  truePct: number,
  total: number,
  lang: Language,
  counts: Record<FitKey, number>,
): string => {
  const pct = (n: number): string =>
    lang === "bn" ? bnDigits(String(n)) : String(n);
  if (key === null) {
    return lang === "bn"
      ? `মিশ্র মত — ${pct(counts.true)}% ঠিক, ${pct(counts.small)}% ছোট, ${pct(counts.large)}% বড়`
      : `Mixed — ${pct(counts.true)}% true, ${pct(counts.small)}% small, ${pct(counts.large)}% large`;
  }
  if (key === "true") {
    return lang === "bn"
      ? `${pct(truePct)}% বলেছেন সাইজ ঠিক`
      : `${pct(truePct)}% say it is true to size`;
  }
  const word =
    key === "small"
      ? lang === "bn"
        ? "ছোট"
        : "small"
      : lang === "bn"
        ? "বড়"
        : "large";
  return lang === "bn"
    ? `বেশিরভাগ বলেছেন সাইজ ${word} — ${pct(counts[key])}%`
    : `Most say it runs ${word} — ${pct(counts[key])}%`;
};

/**
 * Summarise the fit answers of PUBLISHED reviews. Null when there is not
 * enough to say anything, or when the answers are so evenly split that a
 * verdict would be invented.
 */
export const fitSummary = (
  reviews: readonly { fit?: FitKey | null; status?: string }[],
  lang: Language = "bn",
): FitSummary | null => {
  const counts: Record<FitKey, number> = { small: 0, true: 0, large: 0 };
  let total = 0;
  for (const review of reviews) {
    if (review.status && review.status !== "approved") continue;
    if (!isFitKey(review.fit)) continue;
    counts[review.fit] += 1;
    total += 1;
  }
  if (total < MIN_FIT_REVIEWS) return null;

  const truePct = Math.round((counts.true / total) * 100);
  let verdict: FitKey | null;
  if (truePct >= 60) verdict = "true";
  else if (counts.small > counts.large) verdict = "small";
  else if (counts.large > counts.small) verdict = "large";
  else verdict = null;

  return {
    total,
    counts,
    truePct,
    verdict,
    label: label(verdict, truePct, total, lang, counts),
  };
};
