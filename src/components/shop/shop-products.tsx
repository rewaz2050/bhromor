"use client";

import ProductCard from "@/components/product/product-card";
import type { DeliveryZone, Product, Shop } from "@/lib/catalog";
import { shopServesZone } from "@/lib/shop-utils";
import { useMyZone } from "@/lib/use-my-zone";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * One shop's shelf (marketplace slice 4). Products always list — hiding
 * them behind a zone the shopper hasn't confirmed would be presumptuous —
 * but a zone mismatch gets an upfront banner, not a checkout surprise.
 */
export default function ShopProducts({
  products,
  shop,
  zones,
}: {
  products: Product[];
  shop: Shop;
  zones: DeliveryZone[];
}) {
  const { t } = useLanguage();
  const { zoneId } = useMyZone();
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const mismatch = zone !== null && !shopServesZone(shop, zone.id);

  if (products.length === 0) {
    return (
      <div className="rounded-3xl bg-ivory-100 px-6 py-16 text-center ring-1 ring-line">
        <h2 className="font-display text-2xl font-medium text-ink">
          {t("shopBrowser.noProductsFound")}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          {t("shopBrowser.tryAnother")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {mismatch && zone && (
        <p className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          {t("shops.notInYourZone")} ({zone.name}) —{" "}
          {t("shopBrowser.noShopsZoneHint")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
