"use client";

/**
 * "৳999+ orders — free delivery" pill for shop cards, the shop hero and the
 * PDP (2026-09-26). Renders nothing unless the platform or this shop armed a
 * threshold, so stores that opted out look exactly as before.
 */

import { useLanguage } from "@/components/i18n/language-provider";
import type { Shop } from "@/lib/catalog";
import { freeDeliveryAmount, useFreeDelivery } from "@/lib/use-free-delivery";

export default function FreeDeliveryPill({
  shop,
  tone = "light",
  className = "",
}: {
  shop: Pick<Shop, "freeDeliveryMinPaisa"> | null | undefined;
  /** `dark` for the shop hero's forest background. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const { t, lang } = useLanguage();
  const { target } = useFreeDelivery(shop, 0);
  if (target === null) return null;
  return (
    <span
      data-testid="free-delivery-pill"
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        tone === "dark"
          ? "bg-gold-400/15 text-gold-200 ring-gold-300/40"
          : "bg-gold-50 text-forest-900 ring-gold-200"
      } ${className}`}
    >
      🚚 {t("freeDelivery.pill").replace("{amount}", freeDeliveryAmount(target, lang))}
    </span>
  );
}
