"use client";

import Link from "next/link";
import type { Shop } from "@/lib/catalog";
import { isShopOrderable } from "@/lib/shop-utils";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * Public shop card (marketplace slice 4): open state, prep time, and —
 * when the shopper picked a zone the shop doesn't serve — an honest badge
 * instead of a dead end at checkout.
 */
export default function ShopCard({
  shop,
  productCount,
  zoneName,
  servesZone,
}: {
  shop: Shop;
  productCount: number;
  zoneName: string | null;
  servesZone: boolean;
}) {
  const { t } = useLanguage();
  const open = isShopOrderable(shop);
  return (
    <article className="group relative flex min-w-0 flex-col rounded-3xl bg-paper p-6 ring-1 ring-line transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display truncate text-2xl text-forest-900">
            <Link
              href={`/shops/${shop.slug}`}
              className="transition-colors group-hover:text-forest-700"
            >
              {shop.name}
            </Link>
          </h2>
          {shop.tagline && (
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
              {shop.tagline}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            open ? "bg-forest-100 text-forest-800" : "bg-ivory-200 text-ink-soft"
          }`}
        >
          {open ? t("shops.openNow") : t("shops.closed")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span>
          {productCount}{" "}
          {productCount === 1 ? t("shops.product") : t("shops.products")}
        </span>
        <span>{t("shops.prepIn").replace("{min}", String(shop.prepMinutes))}</span>
        {shop.ratingCount > 0 && (
          <span>
            ★ {shop.ratingAvg.toFixed(1)} ({shop.ratingCount})
          </span>
        )}
      </div>

      {zoneName && !servesZone && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
          {t("shops.notInYourZone")} ({zoneName})
        </p>
      )}

      <Link
        href={`/shops/${shop.slug}`}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
      >
        {t("shops.visitShop")}
      </Link>
    </article>
  );
}
