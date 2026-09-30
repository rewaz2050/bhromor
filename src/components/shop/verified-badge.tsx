"use client";

/**
 * B5 (2026-09-28) — the verified-shop badge.
 *
 * It only ever appears for a shop whose NID and trade licence staff have both
 * checked, and it says so in words ("ID and trade licence checked") instead of
 * a bare green tick — a shopper can then decide what that is worth.
 *
 * On a shop that has NOT been checked it renders the neutral "documents not
 * checked yet" line — never "unverified" in warning colours, because most
 * unchecked shops are simply unprocessed, and punishing them for our queue
 * would be a lie of its own.
 *
 * Presentational + plain props: the storefront and the tests need no network.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck } from "@/components/ui/icons";
import {
  isVerified,
  notCheckedLine,
  verifiedOnLabel,
  verificationPromise,
} from "@/lib/shop-verification";
import type { ShopVerification } from "@/lib/catalog";

export default function VerifiedBadge({
  verification,
  /** `full` = the storefront header (adds the date); `chip` = cards. */
  variant = "chip",
  className = "",
}: {
  verification?: ShopVerification | null;
  variant?: "chip" | "full";
  className?: string;
}) {
  const { t } = useLanguage();
  if (!isVerified(verification)) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-ivory-100 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-ink-soft ring-1 ring-line ${className}`}
        title={notCheckedLine()}
        data-testid="verify-none"
      >
        {t("shops.notCheckedShort")}
      </span>
    );
  }
  const at = verification?.verifiedAt;
  const promise = verificationPromise();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-forest-100 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-forest-900 ring-1 ring-forest-200 ${className}`}
      title={at ? `${promise} · ${verifiedOnLabel(at)}` : promise}
      data-testid="verify-badge"
    >
      <IconCheck className="h-3 w-3" aria-hidden="true" />
      {t("shops.verified")}
      {variant === "full" && at && (
        <span className="font-medium normal-case tracking-normal text-forest-800/80">
          · {verifiedOnLabel(at)}
        </span>
      )}
    </span>
  );
}
