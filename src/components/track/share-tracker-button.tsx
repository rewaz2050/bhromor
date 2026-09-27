"use client";

/**
 * "Share tracker with family" (UX plan §7) — the person waiting at home is
 * often not the person who ordered. One tap hands them the same tracker
 * link; every share is a new visitor on our own domain.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import ShareLink from "@/components/ui/share-link";
import { trackHref } from "@/lib/last-order";

export default function ShareTrackerButton({
  orderId,
  phone,
  className = "",
}: {
  orderId: string;
  phone: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <ShareLink
      text={t("track.shareTrackerText").replace("{id}", orderId)}
      url={`${origin}${trackHref(orderId, phone)}`}
      label={t("track.shareTracker")}
      copiedLabel={t("track.shareTrackerCopied")}
      testId="share-tracker"
      className={className}
    />
  );
}
