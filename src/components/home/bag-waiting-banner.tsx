"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconArrowRight, IconClose } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import { coverImage } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { BAG_BANNER_DISMISSED_KEY, bagSignature, readBagTouched, shouldShowBagBanner } from "@/lib/bag-memory";

/**
 * "আপনার ব্যাগে ২টি পিস অপেক্ষা করছে →" (UX plan §5, R10) — a soft band
 * under the hero for a shopper who comes BACK to a bag they left at least
 * 30 minutes ago. Thumbnails of the pieces, the subtotal, one tap to the
 * bag or to checkout; × hides it for this exact bag (a changed bag may ask
 * again). Nothing for an empty or freshly-touched bag.
 */
export default function BagWaitingBanner() {
  const { t, lang } = useLanguage();
  const { lines, detail, itemCount, subtotal, ready, openBag } = useCart();
  const [show, setShow] = useState(false);
  const signature = bagSignature(lines);

  useEffect(() => {
    if (!ready) return;
    let dismissedFor: string | null = null;
    try {
      dismissedFor = window.sessionStorage.getItem(BAG_BANNER_DISMISSED_KEY);
    } catch {
      dismissedFor = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is read after mount so the server and first client paint agree
    setShow(shouldShowBagBanner({ itemCount, touchedAt: readBagTouched(), dismissedFor, signature }));
  }, [ready, itemCount, signature]);

  if (!show || detail.length === 0) return null;
  const count = lang === "bn" ? bnDigits(String(itemCount)) : String(itemCount);
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(BAG_BANNER_DISMISSED_KEY, signature);
    } catch {
      /* fine */
    }
    setShow(false);
  };
  return (
    <section
      aria-label={t("home.bagWaitingAria")}
      data-testid="bag-waiting"
      className="border-b border-line bg-gold-100/60"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 -space-x-2">
          {detail.slice(0, 3).map((line) => (
            <span
              key={`${line.productId}-${line.variantLabel}`}
              className="relative h-11 w-9 overflow-hidden rounded-sm bg-ivory-200 ring-2 ring-paper"
            >
              <Image src={coverImage(line.product).src} alt="" fill sizes="36px" className="object-cover" />
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={openBag}
          className="min-w-0 flex-1 text-left"
          data-testid="bag-waiting-open"
        >
          <span className="block truncate text-sm font-semibold text-forest-900">
            {(itemCount === 1 ? t("home.bagWaitingOne") : t("home.bagWaitingMany")).replace("{count}", count)}
          </span>
          <span className="block text-xs text-ink-soft">
            {formatBdt(subtotal)} · {t("home.bagWaitingSub")}
          </span>
        </button>
        <Link
          href="/checkout"
          className="hidden h-11 shrink-0 items-center gap-1.5 rounded-sm bg-forest-900 px-4 text-sm font-semibold text-ivory-50 hover:bg-forest-800 sm:inline-flex"
        >
          {t("home.bagWaitingCheckout")}
          <IconArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/checkout"
          aria-label={t("home.bagWaitingCheckout")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-forest-900 text-ivory-50 sm:hidden"
        >
          <IconArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("home.bagWaitingDismiss")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-soft hover:bg-ivory-100 hover:text-ink"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
