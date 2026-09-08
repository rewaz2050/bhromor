"use client";

import { Eyebrow } from "@/components/ui/primitives";
import { useLanguage } from "@/components/i18n/language-provider";

export default function CartPageHeader() {
  const { t } = useLanguage();
  return (
    <>
      <Eyebrow>{t("cart.pageEyebrow")}</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        {t("cart.pageTitle")}
      </h1>
    </>
  );
}
