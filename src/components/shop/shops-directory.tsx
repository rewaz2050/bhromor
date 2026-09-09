"use client";

import { useMemo } from "react";
import type { DeliveryZone, Shop } from "@/lib/catalog";
import { shopServesZone } from "@/lib/shop-utils";
import { useMyZone } from "@/lib/use-my-zone";
import { useLanguage } from "@/components/i18n/language-provider";
import ShopCard from "./shop-card";

/**
 * Shops directory grid (marketplace slice 4). With a zone picked, serving
 * shops float to the top; the rest stay visible with an honest badge —
 * hiding them would look like the platform has one shop.
 */
export default function ShopsDirectory({
  shops,
  zones,
  productCounts,
}: {
  shops: Shop[];
  zones: DeliveryZone[];
  productCounts: Record<string, number>;
}) {
  const { t, lang } = useLanguage();
  const { zoneId } = useMyZone();
  const zone = zones.find((z) => z.id === zoneId) ?? null;

  const ordered = useMemo(() => {
    if (!zone) return shops;
    return [...shops].sort((a, b) => {
      const sa = shopServesZone(a, zone.id) ? 0 : 1;
      const sb = shopServesZone(b, zone.id) ? 0 : 1;
      return sa - sb;
    });
  }, [shops, zone]);

  return (
    <div>
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-gold-700">
        Marketplace
      </p>
      <h1
        lang={lang === "bn" ? "bn" : undefined}
        className={`font-display mt-2 text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl ${lang === "bn" ? "font-bengali" : ""}`}
      >
        {t("shops.title")}
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-ink-soft">
        {t("shops.subtitle")}
      </p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((shop) => (
          <ShopCard
            key={shop.id}
            shop={shop}
            productCount={productCounts[shop.id] ?? 0}
            zoneName={zone?.name ?? null}
            servesZone={zone ? shopServesZone(shop, zone.id) : true}
          />
        ))}
      </div>
    </div>
  );
}
