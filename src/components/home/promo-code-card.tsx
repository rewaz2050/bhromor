"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { useHomeSettings } from "@/lib/use-home-settings";
import { publicPromoCode } from "@/lib/home-cms";
import { copyToClipboard } from "@/lib/share";
import { useTransientValue } from "@/lib/use-transient-value";
import { IconArrowRight, IconCopy, IconTag } from "@/components/ui/icons";

/**
 * The owner's public promo code, as a card at the top of the offers block.
 *
 * Renders nothing unless the CMS has it switched on with a code. The card
 * only advertises: the code is still validated by checkout against the
 * live coupon table, so a code the owner never created there simply fails
 * at the bag with the usual message — nothing here invents a discount.
 */
export default function PromoCodeCard() {
  const { t } = useLanguage();
  const { settings } = useHomeSettings();
  const [notice, setNotice] = useTransientValue("");
  const code = publicPromoCode(settings);
  if (!code) return null;
  const text = settings.promo.text.trim();

  const copy = async () => {
    const ok = await copyToClipboard(code);
    setNotice(ok ? t("home.promoCopied") : t("home.promoCopyFailed"));
  };

  return (
    <section
      aria-labelledby="promo-code-heading"
      data-testid="promo-code-card"
      className="border-y border-line bg-forest-950 text-ivory-50"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-gold-200">
            <IconTag className="h-3.5 w-3.5" /> {t("home.promoEyebrow")}
          </p>
          <h2 id="promo-code-heading" className="mt-1.5 font-display text-xl leading-snug sm:text-2xl">
            {text || t("home.promoDefaultText")}
          </h2>
          <p className="mt-1 text-xs text-ivory-100/70">{t("home.promoHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copy}
            data-testid="promo-code-copy"
            aria-label={`${t("home.promoCopy")}: ${code}`}
            className="inline-flex min-h-11 items-center gap-2 border border-dashed border-gold-300/70 bg-ivory-50/5 px-4 font-mono text-sm font-semibold tracking-[0.18em] text-ivory-50 transition-colors hover:bg-ivory-50/10"
          >
            {code}
            <IconCopy className="h-4 w-4 text-gold-200" />
          </button>
          <Link
            href="/shop"
            className="editorial-button min-h-11 bg-ivory-100 px-4 text-forest-950 hover:bg-gold-200"
          >
            {t("home.promoShop")} <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p
          role="status"
          aria-live="polite"
          className={notice ? "w-full text-xs text-gold-200" : "sr-only"}
        >
          {notice}
        </p>
      </div>
    </section>
  );
}
