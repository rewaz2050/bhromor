"use client";

import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";

export default function CheckoutPageHeader() {
  const { t } = useLanguage();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow>{t("checkout.pageEyebrow")}</Eyebrow>
        {/* UX plan §6 (R5) — the form is short; say so before it starts. */}
        <span
          className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-forest-50 px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-forest-800 ring-1 ring-forest-200"
          data-testid="checkout-minute"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-forest-600" />
          {t("checkout.pageMinute")}
        </span>
      </div>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        {t("checkout.pageTitle")}
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        {t("checkout.pageSubtitle")}
      </p>
    </>
  );
}
