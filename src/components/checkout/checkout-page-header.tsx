"use client";

import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";

export default function CheckoutPageHeader() {
  const { t } = useLanguage();
  return (
    <>
      <Eyebrow>{t("checkout.pageEyebrow")}</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        {t("checkout.pageTitle")}
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        {t("checkout.pageSubtitle")}
      </p>
    </>
  );
}
