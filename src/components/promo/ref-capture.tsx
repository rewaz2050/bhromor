"use client";

/**
 * `?ref=PS-XXXXXX` capture (P0 #7) — mounted once in the storefront chrome, so
 * a shared link works whether it lands on /shop, a product, or the home page.
 *
 * The code lives in localStorage (not a cookie, not the URL): it is this
 * device's "who sent me here", it is offered once at checkout, and it can be
 * removed there. Nothing is credited from here — the server decides money.
 *
 * UX plan §8 (R6): the landing also SAYS so — a one-line banner "your friend
 * gave you ৳50" with a shop link, dismissible for the session. A referral
 * link that lands silently converts like any other link.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconClose } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import { formatBdt } from "@/lib/format";
import { REFERRAL_DEFAULTS, captureRefFromUrl, displayRefCode, type StoredRef } from "@/lib/referral";

export const REF_BANNER_DISMISSED_KEY = "prosanti.ref-banner.v1";

const dismissedCode = (): string => {
  try {
    return window.sessionStorage.getItem(REF_BANNER_DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
};

export default function RefCapture() {
  const { t, lang } = useLanguage();
  const [ref, setRef] = useState<StoredRef | null>(null);
  useEffect(() => {
    const stored = captureRefFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydration must happen post-mount
    setRef(stored && dismissedCode() !== stored.code ? stored : null);
  }, []);
  if (!ref) return null;
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(REF_BANNER_DISMISSED_KEY, ref.code);
    } catch {
      /* session storage unavailable — the banner simply returns next page */
    }
    setRef(null);
  };
  return (
    <div
      role="status"
      data-testid="ref-landing"
      className="border-b border-gold-500/40 bg-gold-500/15 text-forest-900"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <span aria-hidden="true" className="text-lg leading-none">🎁</span>
        <p className="min-w-0 flex-1 text-xs leading-5 sm:text-sm">
          <strong className="font-semibold">
            {t("referral.landingTitle").replace(
              "{amount}",
              lang === "bn"
                ? bnDigits(formatBdt(REFERRAL_DEFAULTS.friendRewardPaisa))
                : formatBdt(REFERRAL_DEFAULTS.friendRewardPaisa),
            )}
          </strong>{" "}
          <span className="text-ink-soft">
            {t("referral.landingBody").replace("{code}", displayRefCode(ref.code))}
          </span>{" "}
          <Link href="/shop" className="font-semibold underline underline-offset-4">
            {t("referral.landingCta")}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("referral.landingDismiss")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-gold-500/25"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
