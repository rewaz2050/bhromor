"use client";

/**
 * UX plan §1.4 (R8) — a 404 inside the storefront chrome that ends in
 * product, not a dead end: bilingual copy, one CTA back to the shop, and
 * the best-seller rail underneath.
 */

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { ButtonLink } from "@/components/ui/primitives";
import InfoRail from "./info-rail";

export default function NotFoundView() {
  const { t } = useLanguage();
  return (
    <>
      <div className="flex flex-col items-center px-6 py-20 text-center sm:py-28" data-testid="not-found">
        <p className="font-display text-7xl font-medium text-forest-200">{t("info.notFoundEyebrow")}</p>
        <h1 className="font-display mt-6 text-3xl font-medium text-forest-900">{t("info.notFoundTitle")}</h1>
        <p className="mt-3 max-w-sm text-ink-soft">{t("info.notFoundBody")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href="/shop" size="lg">
            {t("info.notFoundCta")}
          </ButtonLink>
          <Link href="/" className="editorial-text-link">
            {t("info.notFoundHome")}
          </Link>
        </div>
      </div>
      <InfoRail id="not-found-rail" />
    </>
  );
}
