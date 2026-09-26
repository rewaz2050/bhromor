"use client";

/**
 * UX plan §2 (R3) — two curated rails right after the category row:
 *
 *   • Best sellers — ranked by REAL orders (`unitsSold` from
 *     v_product_sales), in stock only. Social proof is what makes a first
 *     visitor's first click; the rail stays away until the shop has at
 *     least two genuine sellers rather than dressing guesses up as "best".
 *   • New arrivals — pieces the shop flagged new, then the newest rows.
 *     Fresh stock is a reason to come back; hidden unless there is a real
 *     row of them (≥ 4), and never repeats a piece the best-seller rail
 *     just showed.
 *
 * Both are ordinary `ProductRail`s (same cards, `data-list` names for the
 * funnel: `best-sellers-rail` / `new-arrivals-rail`) with "See all" links
 * into the sorted shop.
 */

import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";
import { bestSellers, newArrivals } from "@/lib/home-shelves";

export const NEW_RAIL_MIN = 4;

export default function CuratedRails({
  pool,
  showBest = true,
  showNew = true,
  limit = 8,
}: {
  pool: Product[];
  showBest?: boolean;
  showNew?: boolean;
  limit?: number;
}) {
  const { t } = useLanguage();
  const best = showBest ? bestSellers(pool, limit) : [];
  const seen = new Set(best.map((p) => p.id));
  const fresh = showNew ? newArrivals(pool.filter((p) => !seen.has(p.id)), limit) : [];
  const freshRow = fresh.length >= NEW_RAIL_MIN ? fresh : [];
  if (best.length === 0 && freshRow.length === 0) return null;
  return (
    <>
      {best.length > 0 && (
        <ProductRail
          id="best-sellers-rail"
          testId="rail-best-sellers"
          eyebrow={t("home.bestEyebrow")}
          title={t("home.bestTitle")}
          sub={t("home.bestSub")}
          href="/shop?sort=best"
          seeAllLabel={t("home.bestAll")}
          products={best}
          tone="ivory"
        />
      )}
      {freshRow.length > 0 && (
        <ProductRail
          id="new-arrivals-rail"
          testId="rail-new-arrivals"
          eyebrow={t("home.newEyebrow")}
          title={t("home.newTitle")}
          sub={t("home.newSub")}
          href="/shop?sort=newest"
          seeAllLabel={t("home.newAll")}
          products={freshRow}
          tone="paper"
        />
      )}
    </>
  );
}
