"use client";

/**
 * The bag's offer line — one automatic saving (flash drop or a complete set),
 * quoted by the same matchers that price the order (see lib/use-bag-offer.ts).
 * Renders nothing when the bag earns nothing.
 */

import { formatBdt } from "@/lib/format";
import { usePromos } from "@/lib/use-promos";
import { useBagOffer, type OfferLine } from "@/lib/use-bag-offer";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconTag } from "@/components/ui/icons";
import { FlashTimer } from "./flash-timer";

export type { OfferLine };

export default function BagOffers({ lines }: { lines: OfferLine[] }) {
  const { flash } = usePromos();
  const { t } = useLanguage();
  const offer = useBagOffer(lines);
  if (!offer || offer.discount <= 0) return null;

  return (
    <div
      data-testid="bag-offers"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-forest-100 px-3 py-2 text-xs font-medium text-forest-900"
    >
      <IconTag className="h-3.5 w-3.5 shrink-0 text-gold-700" />
      {offer.kind === "flash"
        ? t("promo.bagNote")
            .replace("{n}", String(offer.items))
            .replace("{amount}", formatBdt(offer.discount))
        : t("bundle.completeNote")
            .replace("{name}", offer.label)
            .replace("{amount}", formatBdt(offer.discount))}
      {flash.active && flash.endsAtMs ? (
        <span className="text-ink-soft">
          · <FlashTimer endsAtMs={flash.endsAtMs} />
        </span>
      ) : null}
    </div>
  );
}
