"use client";

/**
 * Loyalty, visible outside the account page (UX plan §8): one line in the
 * bag and the menu — "this order = your 7th stamp, 3 more to the gift".
 * Signed-in customers with an enabled Smart Card only; everyone else sees
 * nothing (the account page carries the join pitch).
 */

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { bnDigits } from "@/lib/arrival";
import { useSmartCard, type SmartCard } from "@/lib/use-smart-card";
import type { Language } from "@/lib/translations";

/** 1 → "1st" / "১ম", 2 → "2nd" / "২য়", 7 → "7th" / "৭ম". */
export const ordinal = (n: number, lang: Language): string => {
  if (lang === "bn") {
    const bn = bnDigits(String(n));
    const suffix = n === 1 ? "ম" : n === 2 || n === 3 ? "য়" : n === 4 ? "র্থ" : n === 6 ? "ষ্ঠ" : "ম";
    return `${bn}${suffix}`;
  }
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** The sentence for a card, or null when there is nothing honest to say. */
export const stampSentence = (
  card: Pick<SmartCard, "enabled" | "target" | "afterOrderStamps" | "rewardTitle"> | null,
  t: (key: "bag.stampLine" | "bag.stampLineFull") => string,
  lang: Language,
): string | null => {
  if (!card || !card.enabled || card.target < 1) return null;
  const reward = card.rewardTitle?.trim() || (lang === "bn" ? "উপহার" : "the gift");
  if (card.afterOrderStamps >= card.target) return t("bag.stampLineFull").replace("{reward}", reward);
  const left = card.target - card.afterOrderStamps;
  return t("bag.stampLine")
    .replace("{ordinal}", ordinal(card.afterOrderStamps, lang))
    .replace("{left}", lang === "bn" ? bnDigits(String(left)) : String(left))
    .replace("{reward}", reward);
};

export default function StampLine({
  className = "",
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { t, lang } = useLanguage();
  const { card } = useSmartCard();
  const sentence = stampSentence(card, t, lang);
  if (!sentence) return null;
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      data-testid="stamp-line"
      aria-label={`${sentence} — ${t("bag.stampLineHref")}`}
      className={`flex min-h-11 items-center gap-2 rounded-xl bg-gold-500/15 px-3 py-2 text-xs font-medium leading-5 text-forest-900 ring-1 ring-gold-500/40 transition-colors hover:bg-gold-500/25 ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">★</span>
      <span>{sentence}</span>
    </Link>
  );
}
