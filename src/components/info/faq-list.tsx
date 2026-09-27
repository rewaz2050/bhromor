"use client";

/**
 * FAQ (UX plan §11 + §1.4, R8) — bilingual accordion with a forgiving
 * search: the same folding the product search uses (case, Bengali
 * spelling variants, synonyms), every word must match somewhere in the
 * question or the answer. Matches open themselves; a miss hands over to
 * support instead of a blank list.
 */

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Eyebrow } from "@/components/ui/primitives";
import { IconSearch } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import { FAQS, type FaqEntry } from "@/lib/faq";
import { expandSearchTerm, foldSearchText } from "@/lib/product-search";

const haystack = (f: FaqEntry): string => foldSearchText([f.q, f.a, f.qBn, f.aBn].join(" "));

/** Pure: which entries answer `query` (empty query → all). */
export const searchFaqs = (faqs: FaqEntry[], query: string): FaqEntry[] => {
  const words = query.split(/\s+/).map(foldSearchText).filter(Boolean);
  if (words.length === 0) return faqs;
  return faqs.filter((f) => {
    const hay = haystack(f);
    return words.every((w) => expandSearchTerm(w).some((c) => c !== "" && hay.includes(c)));
  });
};

export default function FaqList() {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const bn = lang === "bn";
  const digits = (n: number) => (bn ? bnDigits(String(n)) : String(n));
  const shown = useMemo(() => searchFaqs(FAQS, query), [query]);
  const searching = query.trim() !== "";

  return (
    <div>
      <Eyebrow>{t("info.faqEyebrow")}</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        {t("info.faqTitle")}
      </h1>
      <p className="mt-4 leading-7 text-ink-soft">
        {t("info.faqIntroA")}
        <Link href="/contact" className="font-medium text-forest-700 underline underline-offset-4">
          {t("info.faqContactLink")}
        </Link>
        {t("info.faqIntroB")}
      </p>

      <div className="mt-8">
        <label htmlFor={inputId} className="sr-only">
          {t("info.faqSearch")}
        </label>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("info.faqSearchPlaceholder")}
            autoComplete="off"
            className="h-12 w-full rounded-full border border-line bg-paper pl-11 pr-4 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-ink-soft/70 focus:border-forest-600 focus:ring-2 focus:ring-forest-600/20"
          />
        </div>
        <p className="mt-2 text-xs text-ink-soft" aria-live="polite" data-testid="faq-count">
          {t("info.faqCount").replace("{n}", digits(shown.length)).replace("{total}", digits(FAQS.length))}
        </p>
      </div>

      {shown.length === 0 ? (
        <div
          data-testid="faq-empty"
          className="mt-8 rounded-3xl border border-dashed border-line bg-ivory-100/50 px-6 py-10 text-center"
        >
          <p className="text-ink-soft">{t("info.faqNone").replace("{q}", query.trim())}</p>
          <Link
            href="/contact"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("info.faqNoneCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-line border-y border-line" data-testid="faq-list">
          {shown.map((faq) => (
            <details key={faq.id} className="group py-2" open={searching || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.02rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {bn ? faq.qBn : faq.q}
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-forest-800 ring-1 ring-line transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-6 pr-10 text-[0.95rem] leading-7 text-ink-soft">{bn ? faq.aBn : faq.a}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
