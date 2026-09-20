"use client";

import FlashRail from "@/components/promo/flash-rail";
import PromoCodeCard from "@/components/home/promo-code-card";
import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";
import { offerCount, offerProducts } from "@/lib/home-shelves";

const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

/**
 * The offers block (2026-09-20) — between the category row and the shelf.
 *
 * Three kinds of real saving, nothing decorative:
 *   • the owner's public promo code when the CMS has one switched on (the
 *     card copies the code; checkout still validates it — see
 *     components/home/promo-code-card),
 *   • the flash drop rail while a window is running (its own countdown;
 *     renders nothing otherwise — see components/promo/flash-rail), and
 *   • every piece the shop marked down (a struck-through list price),
 *     biggest saving first, with a "See all N offers" link into the
 *     `?filter=sale` shop.
 * With no code, no drop and no markdowns the block stays away entirely: an
 * "Offers" heading over an empty row is noise, not an offer.
 */
export default function OffersBlock({ pool, limit = 8 }: { pool: Product[]; limit?: number }) {
  const { t } = useLanguage();
  const offers = offerProducts(pool, limit);
  const total = offerCount(pool);
  return (
    <div id="offers" className="scroll-mt-24" data-testid="offers-block">
      <PromoCodeCard />
      <FlashRail limit={4} />
      <ProductRail
        id="offers-rail"
        testId="rail-offers"
        eyebrow={t("home.offersEyebrow")}
        title={t("home.offersTitle")}
        sub={t("home.offersSub")}
        href="/shop?filter=sale"
        seeAllLabel={fmt(t("home.offersAll"), { count: total })}
        products={offers}
        tone="paper"
      />
    </div>
  );
}
