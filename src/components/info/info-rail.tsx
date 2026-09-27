"use client";

/**
 * UX plan §11 (R8) — every information page ends with product, not a
 * footer: the best sellers (real `unitsSold`), new arrivals when sales
 * data is still thin. Reads the shared catalog store, so it paints from
 * cache on a return visit and self-fetches on a cold one.
 */

import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import { bestSellers, newArrivals } from "@/lib/home-shelves";
import { useLiveCatalog } from "@/lib/use-live-catalog";

export default function InfoRail({ id = "info-rail" }: { id?: string }) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  const best = bestSellers(products, 8);
  const picks = best.length >= 2 ? best : newArrivals(products, 8);
  if (picks.length < 2) return null;
  const isBest = best.length >= 2;
  return (
    <div className="mt-16 lg:mt-24">
      <ProductRail
        id={id}
        testId="info-rail"
        eyebrow={t("info.railEyebrow")}
        title={isBest ? t("info.railTitle") : t("home.newTitle")}
        sub={isBest ? t("info.railSub") : t("home.newSub")}
        href={isBest ? "/shop?sort=best" : "/shop?filter=new"}
        seeAllLabel={isBest ? t("info.railAll") : t("home.newAll")}
        products={picks}
        tone="ivory"
      />
    </div>
  );
}
